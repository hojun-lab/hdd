# Week 3, Day 2 — Deadlock & Pool Starvation + Spring Transaction 유의사항

> 날짜: 2026-04-06
> 주제: 커넥션 풀 데드락 재현 + Spring @Transactional과 커넥션 풀의 관계

---

## 1. 커넥션 풀 데드락

### 재현 결과

```
pool=2, 스레드 2개, 각 스레드가 getConnection() 2번 호출

[Pool] active=2 idle=0 pending=2 total=2  ← 매초 반복, 영원히 고정
```

- 스레드 A: 커넥션1 보유 → 커넥션2 요청 → 대기
- 스레드 B: 커넥션2 보유 → 커넥션1 요청 → 대기
- **아무도 반환 못 함 → 영구 데드락**

### 프로덕션에서 이 패턴이 발생하는 경우

```java
@Transactional  // 커넥션 1개 잡음
public void transferMoney(Long fromId, Long toId, BigDecimal amount) {
    accountService.withdraw(fromId, amount);  // REQUIRES_NEW → 커넥션 1개 더 필요
    accountService.deposit(toId, amount);
}
```

`REQUIRES_NEW`가 새 트랜잭션 = 새 커넥션을 요구한다. 동시 스레드 수 ≥ poolSize 이면 데드락.

### 데드락 메트릭 패턴

| 시나리오 | active | pending | 회복 |
|---------|--------|---------|------|
| 느린 쿼리 | max | 높음 | 시간 후 회복 |
| 트래픽 폭증 | max | 매우 높음 | 빠르게 소화 |
| 커넥션 누수 | max | 계속 증가 | 절대 안 됨 |
| **데드락** | **N** | **N (같은 수)** | **절대 안 됨** |

데드락의 특징: **active와 pending이 같은 수**. 각 스레드가 1개를 잡고 1개를 기다리니까.

### 방지법 3가지

1. **`REQUIRES_NEW` 사용 최소화** — `REQUIRED`(기본값)로 대부분 충분
2. **풀 사이즈 공식**: `maximumPoolSize ≥ 동시 스레드 수 × 요청당 커넥션 수`
3. **중첩 커넥션용 별도 풀** — 내부 트랜잭션은 다른 DataSource 사용

---

## 2. Spring @Transactional과 커넥션 풀

### Propagation별 커넥션 사용

| Propagation | 커넥션 수 | 데드락 위험 | 설명 |
|------------|----------|-----------|------|
| `REQUIRED` (기본값) | **1개** (부모 공유) | 없음 | 기존 트랜잭션에 참여 |
| `REQUIRES_NEW` | **2개** (별도) | **있음** | 새 트랜잭션 = 새 커넥션 |
| `NESTED` | **1개** (부모 공유) | 없음 | savepoint 기반, 같은 커넥션 |
| `NOT_SUPPORTED` | **0개** (반환) | 없음 | 트랜잭션 없이 실행 |

### 커넥션 공유 메커니즘

Spring은 `TransactionSynchronizationManager`에 현재 스레드의 커넥션을 **ThreadLocal**로 저장한다.

```
Thread A → @Transactional 시작 → 커넥션 획득 → ThreadLocal에 저장
         → childService.method() 호출 → 같은 ThreadLocal에서 커넥션 꺼냄
         → 같은 커넥션 재사용
         → 트랜잭션 종료 → 커넥션 반환
```

자식 메서드에 `@Transactional`이 없어도, 부모의 트랜잭션 안에서 실행되면 **같은 커넥션을 사용한다.**

### `REQUIRES_NEW`가 필요한 유일한 케이스

- **자식이 실패해도 부모는 커밋되어야 할 때**
  - 감사 로그 (audit log)
  - 알림 발송 기록
  - 에러 로그 저장
- 그 외에는 `REQUIRED`로 충분하다

---

## 3. Spring AOP 프록시 제약사항 (CP 유의사항)

### @Transactional이 무시되는 경우

| 상황 | @Transactional 동작 | 이유 |
|------|---------------------|------|
| `public` + 외부 빈에서 호출 | ✅ 동작 | 프록시를 통과 |
| `private` 메서드 | ❌ 무시 | 프록시가 private 접근 불가 |
| 같은 클래스 내부 호출 (`this.method()`) | ❌ 무시 | 프록시를 우회 (self-invocation) |
| `protected` / `package-private` | ❌ 무시 (CGLIB은 가능하나 비권장) | 프록시 타입에 따라 다름 |

### 왜 이게 CP와 관련있는가?

```java
@Service
public class OrderService {
    @Transactional
    public void createOrder() {
        // 커넥션 1개 잡음
        this.saveAuditLog();  // ← @Transactional(REQUIRES_NEW) 무시됨!
        // 결과: 새 커넥션 안 잡힘, 부모 트랜잭션에서 실행
        // 의도와 다르지만, 데드락은 안 생김 (아이러니)
    }
    
    @Transactional(propagation = REQUIRES_NEW)
    public void saveAuditLog() {
        // 프록시 안 탐 → REQUIRES_NEW 무시 → 부모 트랜잭션 사용
    }
}
```

- 개발자 의도: 감사 로그는 독립 트랜잭션 → 커넥션 2개
- 실제 동작: 프록시 우회 → 같은 트랜잭션 → 커넥션 1개
- **데드락은 안 생기지만, 부모 롤백 시 감사 로그도 함께 롤백됨** (의도와 다름)

### 해결법

```java
// 방법 1: 별도 빈으로 분리 (권장)
@Service
public class AuditService {
    @Transactional(propagation = REQUIRES_NEW)
    public void saveAuditLog() { ... }  // 외부 빈 → 프록시 동작
}

// 방법 2: self-injection (비권장, 하지만 동작함)
@Service
public class OrderService {
    @Autowired
    private OrderService self;  // 프록시 주입
    
    @Transactional
    public void createOrder() {
        self.saveAuditLog();  // 프록시를 통해 호출 → REQUIRES_NEW 동작
    }
}
```

---

## 4. CP 관점에서의 @Transactional 체크리스트

### 코드 리뷰 시 반드시 확인할 것

| # | 체크 항목 | 위험 |
|---|---------|------|
| 1 | `REQUIRES_NEW`가 있는가? | 커넥션 2개 → 데드락 위험 |
| 2 | 같은 클래스 내부 호출인가? | @Transactional 무시 → 의도와 다른 동작 |
| 3 | private 메서드에 @Transactional인가? | 무조건 무시됨 |
| 4 | 트랜잭션 안에서 외부 API 호출하는가? | 커넥션 장시간 점유 → 풀 고갈 |
| 5 | 트랜잭션 범위가 넓은가? | 넓을수록 커넥션 점유 시간 증가 |

### 프로덕션 공식

```
필요한 maximumPoolSize ≥ 동시_스레드_수 × 스레드당_최대_커넥션_수

예: 톰캣 스레드 200개, REQUIRES_NEW 1곳 사용
→ 최대 커넥션 = 200 × 2 = 400 ← DB가 버틸 수 있는가?
→ 대부분 버틸 수 없음 → REQUIRES_NEW를 쓰면 안 되는 이유
```

---

## 오늘의 핵심 한 줄

> **REQUIRES_NEW = 새 커넥션. 동시 스레드 ≥ 풀 사이즈이면 데드락. Spring 프록시 제약까지 이해해야 CP 문제를 정확히 진단할 수 있다.**
