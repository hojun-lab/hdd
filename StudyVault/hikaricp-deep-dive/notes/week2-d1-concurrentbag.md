# Week 2, Day 1 — ConcurrentBag Deep-Dive: PoolEntry + CAS 구현

> 날짜: 2026-03-30
> 주제: PoolEntry + AtomicInteger로 lock-free 커넥션 풀 구현

---

## 핵심 개념

### 1. PoolEntry — 커넥션을 상태와 함께 감싸기

```java
record PoolEntity(
    Connection connection,
    AtomicInteger state  // 0 = NOT_IN_USE, 1 = IN_USE
) {}
```

- v1은 `ArrayList<Connection>`으로 커넥션을 직접 관리 → 꺼내고 넣는 방식
- v2는 커넥션을 **항상 리스트에 두고**, 상태값만 CAS로 변경

### 2. CAS (Compare-And-Swap)의 핵심

```java
// 올바른 사용법 — 확인 + 변경이 원자적으로 한 방에
if (entry.state().compareAndSet(0, 1)) {
    // 성공: 내가 가져감
}

// 틀린 사용법 — 확인과 변경 사이에 다른 스레드가 끼어들 수 있음
if (entry.state().get() == 0) {       // ← 여기서 확인하고
    entry.state().compareAndSet(0, 1); // ← 여기서 바꾸면 늦음
}
```

### 3. ThreadLocal 힌트

```java
ThreadLocal<PoolEntity> lastUsed = new ThreadLocal<>();
```

- 필드로 선언해야 함 (메서드 안에서 new하면 매번 새로 생성됨)
- `lastUsed.get()`은 null일 수 있음 → 반드시 null 체크
- 커넥션을 획득할 때 `lastUsed.set(entry)` → 다음에 같은 커넥션 우선 시도

---

## v2 getConnection() 흐름

```java
public Connection getConnection() {
    // ① ThreadLocal에서 마지막 커넥션 확인 → CAS 시도
    PoolEntity entry = lastUsed.get();
    if (entry != null && entry.state().compareAndSet(0, 1)) {
        return entry.connection();
    }

    // ② 공유 풀 순회 → CAS 시도
    for (PoolEntity loopEntry : sharedList) {
        if (loopEntry.state().compareAndSet(0, 1)) {
            lastUsed.set(loopEntry);  // 다음에 이 스레드가 또 쓸 수 있게 기록
            return loopEntry.connection();
        }
    }

    // ③ 대기 (W2D2에서 구현)
    throw new RuntimeException("No available connection");
}
```

---

## 벤치마크 결과: v1 vs v2 (동일 조건)

### 테스트 조건
- 스레드 50, 풀 10, iteration 1000, 총 50,000건

| 버전 | 동기화 방식 | 처리량 | 실패 | 실패율 |
|------|-----------|--------|------|--------|
| v1 | synchronized | 6,714/sec | 34,382 | **69%** |
| v2 | ThreadLocal + CAS | 7,044/sec | 34,392 | **69%** |

### 핵심 발견: 실패율이 동일하다

- 처리량은 v2가 약 5% 높지만, **실패율은 거의 같다 (69%)**
- CAS로 락을 제거해도 — 대기 메커니즘이 없으면 실패율은 변하지 않는다
- **진짜 병목은 동기화 방식이 아니라, 풀이 비었을 때 즉시 포기하는 설계**

### CAS의 효과는 언제 나타나는가?

대기 메커니즘이 추가된 후에 차이가 벌어진다:
- `synchronized` + 대기: 대기 진입/탈출에도 락 경합 발생
- `CAS` + 대기: 대기 외의 경로에서는 경합 없음

→ 스레드 수가 많아질수록 차이가 커진다

---

## 인사이트

### 1. CAS만으로는 부족하다

| 개선 | 효과 |
|------|------|
| synchronized → CAS | 처리량 5% 향상 |
| 대기 메커니즘 없음 → 있음 | 실패율 69% → ~0% (예상) |

**대기 메커니즘의 효과가 CAS 전환보다 압도적으로 크다.**

### 2. CAS의 올바른 사용법

- `compareAndSet()`의 **반환값**이 성공 여부다. 반환값을 반드시 체크해야 한다
- `get()` 따로, `set()` 따로 호출하면 CAS를 쓰는 의미가 없다
- release에서는 `set(0)` 사용 가능 — 반환하는 스레드만 해당 커넥션을 갖고 있으므로 경합 없음

### 3. ThreadLocal 사용 시 주의사항

- **필드로 선언**: 메서드 안에서 `new ThreadLocal()`하면 매번 새 인스턴스
- **null 체크 필수**: 처음 호출하는 스레드는 ThreadLocal이 비어있음
- **누수 주의**: 스레드풀 환경에서 ThreadLocal을 정리하지 않으면 메모리 누수

---

## 오늘의 핵심 한 줄

> **synchronized→CAS는 5% 개선, 대기 메커니즘 추가는 69%→0% 개선. 진짜 병목을 먼저 해결하라.**

---

## 다음 학습 (W2D2)

- ③번 대기 메커니즘 구현: `wait()/notify()` 또는 `SynchronousQueue`
- v2에 대기를 추가하면 실패율이 얼마나 줄어드는가?
