# Week 1, Day 4 — HikariCP vs Others + MiniPool v1 한계

> 날짜: 2026-03-26
> 주제: HikariCP가 빠른 진짜 이유 + synchronized 풀의 한계 확인

---

## 핵심 개념

### 1. 커넥션 풀별 동기화 방식 비교

| 풀 | 동기화 방식 | 병목 |
|----|-----------|------|
| **DBCP 1.x** | `synchronized` 블록 | 전체 풀에 글로벌 락 |
| **c3p0** | `synchronized` + 내부 큐 | 락 경합 + 불필요한 객체 생성 |
| **Tomcat Pool** | `ReentrantLock` + `LinkedBlockingDeque` | 락은 있지만 DBCP보다 나음 |
| **HikariCP** | **ThreadLocal + CAS + SynchronousQueue** | **락 거의 없음** |

### 2. HikariCP ConcurrentBag 전략

```
getConnection() 호출 시:

① ThreadLocal 확인 → "내가 마지막에 쓴 커넥션이 비어있는가?"
   └─ YES → 락 없이 O(1)로 반환 ★ 가장 빠른 경로
   └─ NO  → ②로

② 공유 리스트(sharedList) 스캔 → CAS로 상태 변경 (NOT_IN_USE → IN_USE)
   └─ 성공 → 반환
   └─ 실패 → ③으로

③ SynchronousQueue에서 대기 → 다른 스레드가 반환할 때 직접 핸드오프
   └─ connectionTimeout 초과 시 예외
```

### 3. 벤치마크의 함정

벤치마크는 `getConnection()` → `close()` 속도를 측정한다. 하지만:

| 구간 | 시간 |
|------|------|
| 커넥션 획득 | 0.001 ~ 0.01ms |
| 쿼리 실행 | 5 ~ 100ms |
| 비즈니스 로직 | 1 ~ 50ms |

- 커넥션 획득은 전체의 **0.01% 미만**
- HikariCP가 c3p0보다 100배 빠르다 해도 사용자 체감 불가
- **HikariCP의 진짜 가치: 평시 성능이 아니라 장애 내성**
  - 동시 요청 폭증 시 lock-free로 버팀
  - 풀 고갈 시 대기 + 핸드오프 메커니즘
  - leak detection, validation, maxLifetime 등 안전장치

---

## 벤치마크 결과: MiniPool v1 한계

### 테스트 조건
- 풀 사이즈: 10, iteration: 1000

### 결과 — 커넥션 점유 시간에 따른 차이

**`SELECT 1` (점유 시간 < 1ms)**

| 스레드 | 총 요청 | 실패 | 실패율 |
|--------|---------|------|--------|
| 50 | 50,000 | 0 | **0%** |
| 200 | 200,000 | 0 | **0%** |

**`Thread.sleep(100)` (점유 시간 100ms)**

| 스레드 | 총 요청 | 실패 | 실패율 |
|--------|---------|------|--------|
| 200 | 200,000 | **184,959** | **92%** |

### 핵심 발견: 같은 풀인데 왜 결과가 다른가?

`SELECT 1`은 점유 시간이 1ms도 안 된다. 커넥션을 빌려서 즉시 반환하니까 200개 스레드가 10개 커넥션을 "돌려막기"할 수 있다. 하지만 실제 프로덕션 쿼리(10~100ms)를 시뮬레이션하면 — 10개 커넥션이 모두 점유되고, 나머지 190개 스레드는 전부 실패한다.

### 원인 분석

MiniPool v1의 `getConnection()`:
```java
synchronized Connection getConnection() {
    if (connectionStore.isEmpty()) {
        throw new RuntimeException("Connection is null");  // ← 즉시 포기
    }
    ...
}
```

- 풀이 비어있으면 **대기하지 않고 즉시 예외**
- 10개 커넥션이 모두 사용 중일 때 나머지 스레드는 전부 실패
- 처리량이 높아 보이지만 — 실패한 요청이 빨리 끝나서 숫자가 부풀려진 것

### 디버깅에서 배운 것: catch 범위의 중요성

처음에 실패가 0건으로 보였던 이유:
```java
catch (SQLException e) {          // ← SQLException만 잡음
    failCount.incrementAndGet();
}
```
MiniPool은 `RuntimeException`을 던지고 있었기 때문에 `catch`에 잡히지 않았다. 스레드가 조용히 죽고, 실패 카운트는 올라가지 않았다. `Exception`으로 바꾸고 나서야 실패 184,959건이 드러났다.

**프로덕션 교훈**: 예외를 너무 좁게 잡으면 장애가 숨는다. 커넥션 풀 관련 예외는 `SQLException`뿐이 아니다.

### HikariCP는 어떻게 다른가?

- 빈 풀 → `connectionTimeout`(기본 30초)까지 **대기**
- `SynchronousQueue`로 반환과 대기를 직접 연결 (핸드오프)
- 대기 중인 스레드에게 반환된 커넥션을 바로 전달
- 모든 스레드가 순서대로 처리됨 (실패 최소화)

---

## 인사이트 정리

### 1. 커넥션 풀 성능을 결정하는 3대 변수

| 변수 | 영향 | 비유 |
|------|------|------|
| **풀 사이즈** | 동시에 빌려줄 수 있는 수 | 식당 좌석 수 |
| **동시 스레드 수** | 동시에 요청하는 수 | 대기 손님 수 |
| **커넥션 점유 시간** | 한 스레드가 얼마나 오래 잡고 있는가 | 손님이 얼마나 오래 먹는가 |

이 세 가지가 엮여 있다:
- 점유 시간 짧으면 → 적은 풀로도 많은 스레드 감당 (0% 실패)
- 점유 시간 길면 → 풀이 고갈되고 대기 메커니즘 없으면 대량 실패 (92%)

**풀 사이즈 공식 (Week 2에서 깊게 다룸):**
> 풀 사이즈 ≈ 동시 스레드 수 × (커넥션 점유 시간 / 전체 요청 처리 시간)

### 2. "빠르다"의 진짜 의미

- HikariCP vs DBCP 벤치마크에서 보이는 성능 차이는 **평시에는 체감 불가능** (0.01% 미만)
- 진짜 차이는 **극한 상황** (커넥션 폭증, 풀 고갈, 장애 전파)에서 나타남
- **선택 기준은 평시 성능이 아니라 장애 내성**

### 3. synchronized의 한계는 "느려서"가 아니라 "대기를 못 해서"

- MiniPool v1의 문제는 `synchronized`가 느린 게 아님
- 풀이 비었을 때 **기다리지 않고 즉시 포기**하는 설계가 문제
- HikariCP의 `SynchronousQueue` + `connectionTimeout`이 이 문제를 해결

### 4. 예외 처리는 모니터링의 기초

- `catch(SQLException)`만 잡으면 `RuntimeException`으로 인한 실패가 숨겨짐
- 프로덕션에서 장애가 "조용히" 발생하는 대표적 패턴
- 커넥션 풀 관련 모니터링은 예외 타입을 넓게 잡아야 함

---

## 오늘의 핵심 한 줄

> **HikariCP가 빠른 이유는 ThreadLocal + CAS로 락을 제거했기 때문이고, 진짜 가치는 극한 상황에서의 장애 내성이다.**

---

## 다음 학습 (D5)

- HikariCP 아키텍처 전체 개요: ConcurrentBag을 직접 설계한다면?
- MiniPool v1의 문제점 정리 + v2 설계 문서 작성 (코드 아직 금지)
