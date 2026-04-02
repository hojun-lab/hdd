# Week 2, Day 4 — Leak Detection & Connection Validation

> 날짜: 2026-04-01
> 주제: 커넥션 누수 감지 기능 구현 (HikariCP leakDetectionThreshold)

---

## 핵심 개념

### 1. 커넥션 누수란?

```java
Connection conn = pool.getConnection();
Statement stmt = conn.createStatement();
stmt.execute("INSERT INTO orders ...");
// release() 호출을 깜빡함 ← 누수!
```

- `release()`를 안 하면 커넥션이 **영원히 IN_USE 상태**
- 풀 사이즈 10에서 이런 코드가 10번 실행되면 → **풀 영구 고갈**
- 프로덕션에서 가장 찾기 어려운 버그 중 하나

### 2. Leak Detection 원리

```
getConnection() 시점:
  ① Throwable 캡처 → "누가 빌려갔는가" 기록
  ② borrowTime 기록 → "언제 빌려갔는가" 기록
  ③ ConcurrentHashMap<PoolEntity, LeakInfo>에 저장

감시 스레드 (1초마다):
  map 순회 → currentTime - borrowTime > threshold?
  → 초과 시: 경고 로그 + 스택트레이스 출력

release() 시점:
  map에서 해당 엔트리 제거 → 정상 반환, 경고 없음
```

### 3. 왜 getConnection() 시점에 Throwable을 캡처하는가?

- 알고 싶은 건 **"누가 이 커넥션을 빌려갔는가"**
- `release()`는 호출 안 된 거니까 거기서 캡처 불가
- `new Throwable()` → 호출 시점의 전체 스택트레이스가 캡처됨
- 나중에 `throwable.printStackTrace()` → 누수 발생 코드 위치 출력

### 4. 구현에 사용한 자료구조

| 컴포넌트 | 역할 |
|---------|------|
| `ConcurrentHashMap<PoolEntity, LeakInfo>` | 빌려간 커넥션 추적 (스레드 안전) |
| `LeakInfo(Throwable, long)` | 스택트레이스 + 빌려간 시각 |
| `ScheduledExecutorService` | 1초마다 감시 태스크 실행 |

### 5. PoolEntity가 record인데 가변 필드가 필요하면?

두 가지 선택지:
1. record → class로 변경 (가변 필드 추가)
2. **별도 Map으로 관리** (관심사 분리)

**2번 선택**: Leak 감지는 커넥션의 속성이 아니라 풀의 부가 기능이므로 별도 관리가 깔끔

---

## 테스트 결과

```
=== Leak Detection Test ===
leakDetectionThreshold: 2000ms

커넥션 빌려감. release() 호출 안 함. 5초 대기...

java.lang.Throwable
    at io.deepdive.pool.MiniPoolV2.getConnection(MiniPoolV2.java:46)
    at io.deepdive.pool.d7.Main.main(Main.java:19)

=== 테스트 종료 ===
```

- `getConnection()` 호출 후 `release()` 안 함
- 2초 후 감시 스레드가 감지 → 스택트레이스 출력
- **정확히 Main.java 19번째 줄을 가리킴** → 누수 원인 즉시 파악 가능

---

## 개선 과제

### 반복 경고 문제

현재 구현: 1초마다 감시 → 같은 누수에 대해 **매초 반복 경고**
- 5초 대기 시 스택트레이스가 3~4번 출력됨
- 프로덕션에서 로그 폭발

HikariCP 해결법: **한 번 경고한 커넥션은 다시 경고하지 않음**
- `LeakInfo`에 `alreadyWarned` 플래그 추가로 해결 가능

---

## 인사이트

### 1. Leak Detection은 개발/스테이징 환경에서 특히 유용

- 프로덕션: threshold를 넉넉하게 (예: 60초)
- 개발/스테이징: threshold를 짧게 (예: 2초) → 누수 빠르게 발견
- HikariCP 기본값: 0 (비활성) → 명시적으로 켜야 함

### 2. leakDetectionThreshold를 너무 짧게 잡으면?

- 정상적으로 오래 걸리는 쿼리(배치, 리포트)도 경고 대상이 됨
- False positive → 로그 노이즈 → 진짜 누수를 놓칠 수 있음
- **쿼리 p99 실행시간보다 길게 설정**하는 게 원칙

### 3. try-with-resources가 근본적 해결책

```java
try (Connection conn = pool.getConnection()) {
    // 사용
} // 자동으로 close/release
```

- Leak Detection은 **감지** 도구이지 **방지** 도구가 아님
- 방지는 코드 레벨에서 try-with-resources로

---

## 오늘의 핵심 한 줄

> **Leak Detection = getConnection() 시점에 Throwable 캡처 + 감시 스레드. 누수의 "누가"와 "언제"를 알려준다.**
