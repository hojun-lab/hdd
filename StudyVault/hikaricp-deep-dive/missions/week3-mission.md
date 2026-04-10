# Week 3 Final Mission

> 제출 기한: 이 파일에 직접 작성
> 제출 형식: 아래 각 섹션에 답변 작성

---

## Mission 1: Incident Diagnosis

### 프로덕션 장애 보고서

**발생 시각**: 월요일 오전 9:15  
**서비스**: Spring Boot API 서버 (HikariCP + AWS RDS MySQL)  
**증상**:
- API 응답시간 p99: 200ms → 35초로 급증
- 일부 요청에서 `HikariPool-1 - Connection is not available, request timed out after 30000ms` 에러
- 오전 9시 이후 급격히 악화, 9시 이전(주말)은 정상
- `hikaricp_connections_active = 10` (maximumPoolSize = 10)
- `hikaricp_connections_pending = 89`
- DB 모니터링: active sessions = 10, 전부 `Sleep` 상태
- Leak Detector 경고 없음
- 슬로우 쿼리 로그 없음

**설정값**:
```
maximumPoolSize = 10
connectionTimeout = 30000
idleTimeout = 600000 (10분)
maxLifetime = 1800000 (30분)
minimumIdle = 2
leakDetectionThreshold = 0
```

**코드 힌트**:
```java
@Transactional
public OrderResponse createOrder(OrderRequest req) {
    Order order = orderRepository.save(req.toEntity());
    inventoryService.decreaseStock(req.itemId(), req.quantity()); // 외부 재고 서비스 HTTP 호출 (평균 25초 소요)
    return OrderResponse.from(order);
}
```

---

### 답변 작성

#### 1. 근본 원인 진단

(여기에 작성)

#### 2. 설정 수정안

| 파라미터 | 현재 값 | 제안 값 | 근거 |
|---------|---------|---------|------|
| | | | |

#### 3. 수정의 사이드이펙트

(여기에 작성 — 제안한 수정이 어떤 새로운 문제를 만들 수 있는가?)

#### 4. 재발 방지 모니터링 알림 설계

| 알림 조건 | 임계값 | 대응 방법 |
|---------|--------|----------|
| | | |

---

## Mission 2: MiniPool Retrospective

### Part A — HikariCP가 나보다 잘한 것

최종 벤치마크 결과: MiniPool 1,323 req/sec vs HikariCP 3,434 req/sec (2.6배 차이)

아래 항목들에 대해 HikariCP가 어떻게 더 잘 처리하는지 설명하라:

| 항목 | MiniPool 구현 | HikariCP 구현 | 차이 |
|------|-------------|--------------|------|
| 공유 리스트 자료구조 | | | |
| 커넥션 검증 최적화 | | | |
| 순회 성능 | | | |
| 풀 반환 API | | | |
| 유휴 커넥션 관리 | | | |

### Part B — 만들면서 깨달은 것

3주 동안 MiniPool을 만들면서 얻은 핵심 인사이트를 **본인의 말로** 작성하라.

1. 커넥션 풀이 없으면 어떤 일이 벌어지는가?

2. synchronized vs CAS — 실제로 어느 쪽이 더 중요했는가? 왜?

3. 대기 메커니즘(Semaphore)이 없으면 어떤 일이 벌어지는가?

4. maxLifetime과 isValid()가 각각 막는 장애는 무엇인가?

5. HikariCP를 직접 사용할 때 어떤 파라미터를 가장 먼저 확인하겠는가? 왜?

### Part C — "이것만은 반드시 기억하라"

이 3주 과정에서 **단 하나의 교훈**만 뽑는다면?

(여기에 한 문장으로)

---

## 제출 후

미션 제출 시 멘토가 다음을 검토한다:
- Incident Diagnosis: 근본 원인을 정확히 짚었는가? 코드 힌트를 활용했는가?
- Retrospective: 표면적 나열인가, 아니면 직접 만들어본 경험에서 나온 통찰인가?
