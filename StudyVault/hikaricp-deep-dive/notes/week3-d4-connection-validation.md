# Week 3, Day 4 — Connection Validation + isValid() 구현

> 날짜: 2026-04-09
> 주제: isValid() 검증 시점 트레이드오프 + 3중 방어 체계

---

## 핵심 개념

### 1. isValid() 검증 시점: 언제 체크하는 게 최적인가?

| 시점 | 장점 | 단점 |
|------|------|------|
| **빌려줄 때 (borrow-time)** | 호출자가 항상 유효한 커넥션을 받음 | 매 요청마다 DB 왕복 1회 추가 (성능 저하) |
| **반환할 때 (return-time)** | 빌려줄 때 검증 비용 없음 (빠름) | 반환 후 ~ 다음 빌려가기 사이에 커넥션이 죽을 수 있음 |

**HikariCP의 선택: return-time 검증 기본.** 성능이 최우선이기 때문.

빌려줄 때도 완전 무시하지 않음 — maxLifetime 체크 + isValid()를 선별적으로 확인.

### 2. isValid()가 필요한 시점 vs 불필요한 시점

| 시점 | isValid() 필요? | 이유 |
|------|----------------|------|
| **생성 직후** | 불필요 | TCP handshake + 인증 완료 = 유효 확정. DriverManager.getConnection() 실패 시 SQLException으로 이미 잡힘 |
| **빌려줄 때** | 필요 | idle 상태에서 DB가 재시작/네트워크 끊김 가능 |
| **반환할 때** | 필요 | 사용 중 DB가 죽었을 수 있음. 죽은 커넥션 풀에 넣으면 다음 호출자가 피해 |

### 3. MiniPoolV2의 3중 방어 체계

```
┌────────────────────────────────────────────────────┐
│                    3중 방어                          │
├──────────────┬─────────────────┬───────────────────┤
│ maxLifetime  │ isValid()       │ Leak Detector     │
├──────────────┼─────────────────┼───────────────────┤
│ 시간 기반 폐기 │ 상태 기반 폐기   │ 미반환 감지       │
│ "너무 오래됨"  │ "DB가 죽었음"   │ "반환 안 했음"    │
│ getConnection │ get + release   │ ScheduledExecutor │
│  시 체크      │  양쪽에서 체크    │  로 주기적 체크    │
└──────────────┴─────────────────┴───────────────────┘
```

| 방어 | 체크 시점 | 잡는 문제 |
|------|----------|----------|
| **maxLifetime** | getConnection() | stale 커넥션 (DB wait_timeout 초과) |
| **isValid()** | getConnection() + release() | 갑작스러운 DB 재시작, 네트워크 끊김 |
| **Leak Detector** | 1초마다 주기적 | release() 안 하는 코드 버그 |

---

## 구현

### getConnection() — replaceConnection()에서 검증

```
private PoolEntity replaceConnection(PoolEntity old) {
    if (maxLifetime 초과 || !old.connection().isValid(1)) {
        // 폐기 + 새 커넥션 생성 + sharedList 교체
    }
    return old;
}
```

두 조건을 **OR**로:
- maxLifetime 초과: 시간이 다 된 커넥션
- isValid() 실패: 시간은 남았지만 DB가 죽은 커넥션

### release() — 반환 시점 검증

```
public void release(PoolEntity poolEntity) {
    if (poolEntity.connection().isValid(1)) {
        // 정상: 풀에 반환
    } else {
        // 무효: 폐기 + 새 커넥션 생성 + sharedList에 추가
        // semaphore.release()는 어느 경우든 반드시 호출
    }
}
```

**핵심**: 무효한 커넥션을 폐기할 때도 **semaphore.release()는 반드시 해야 한다.** 안 하면 허가증이 영구 소실되어 풀 사이즈가 점점 줄어든다.

---

## DB 재시작 시나리오

```
1. 풀 초기화: 커넥션 10개 생성 (전부 유효)
2. 서비스 운영 중
3. DB 갑자기 재시작 (또는 네트워크 순단)
4. 풀에 있는 10개 커넥션 전부 죽음 (하지만 풀은 모름)
5. 요청 들어옴 → getConnection()
6. ThreadLocal에서 커넥션 획득 → replaceConnection() 호출
7. isValid(1) → false!
8. 폐기 + 새 커넥션 생성 → 정상 반환
9. 사용자는 에러 없이 쿼리 성공
```

isValid()가 없었다면 → 6번에서 죽은 커넥션을 그대로 반환 → 쿼리 실행 시 `Communications link failure` → 500 에러.

---

## HikariCP의 추가 최적화

### aliveBypassWindowMs (500ms)

HikariCP는 매번 isValid()를 호출하지 않는다. 커넥션이 **500ms 이내에 사용된 적이 있으면** isValid() 체크를 건너뛴다. "방금 썼으니 살아있을 것"이라는 합리적 가정.

이렇게 하면:
- 트래픽이 많을 때: 대부분 500ms 이내 재사용 → isValid() 거의 안 불림 → 빠름
- 트래픽이 적을 때: 오랜만에 사용 → isValid() 호출 → 안전

### connectionTestQuery vs isValid()

| 방식 | 동작 | 성능 |
|------|------|------|
| `connectionTestQuery = "SELECT 1"` | 실제 쿼리 실행 | 느림 (네트워크 왕복) |
| `isValid(timeout)` (JDBC4+) | 드라이버 내부 검증 | 빠름 (프로토콜 레벨) |

HikariCP 권장: **isValid() 사용** (connectionTestQuery 설정 불필요). JDBC4 이상이면 자동.

---

## 인사이트

### 1. 검증은 "보험"이다

- 보험료 = isValid() 호출 비용 (DB 왕복 ~1ms)
- 보험금 = 죽은 커넥션으로 쿼리 실패 시 사용자 에러 + 장애 대응 비용
- **비용 대비 효과가 압도적** — 1ms로 500 에러를 방지

### 2. 방어는 겹쳐야 한다

- maxLifetime만으로 충분하지 않음 (갑작스러운 DB 재시작)
- isValid()만으로 충분하지 않음 (비용이 비쌈, 매번 호출 부담)
- Leak Detector만으로 충분하지 않음 (감지만 하고 방지는 못 함)
- **3중 방어가 각각의 빈틈을 채운다**

### 3. semaphore.release()를 빼먹으면?

커넥션 폐기 시 semaphore.release()를 안 하면:
- 허가증 영구 소실
- 풀의 실효 사이즈가 점점 줄어듦
- 시간이 지나면 풀 고갈 → 전체 장애
- **리소스 해제는 항상 finally 또는 양쪽 분기 모두에서 보장해야 한다**

---

## 오늘의 핵심 한 줄

> **isValid()는 1ms짜리 보험이다. borrow + return 양방향으로 걸고, maxLifetime + Leak Detector와 함께 3중 방어를 구축하라.**
