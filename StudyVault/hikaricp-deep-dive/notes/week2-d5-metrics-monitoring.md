# Week 2, Day 5 — Metrics & Monitoring

> 날짜: 2026-04-03
> 주제: 풀 메트릭 구현 + 메트릭 기반 장애 판단

---

## 핵심 개념

### 1. HikariCP 4대 메트릭

| 메트릭 | 의미 | 정상 | 위험 |
|--------|------|------|------|
| `active` | 현재 사용 중인 커넥션 | < maximumPoolSize | = maximumPoolSize |
| `idle` | 풀에서 대기 중인 커넥션 | > 0 | 0 |
| `pending` | 커넥션을 기다리는 스레드 | 0 | > 0 지속 |
| `total` | 전체 커넥션 수 | = maximumPoolSize | 변동 없어야 함 |

### 2. 메트릭만으로 근본 원인을 알 수 있는가?

**아니다.** 같은 `active=10, pending=30` 상황에서:

| 원인 | 메트릭 동일 | 추가 단서 |
|------|-----------|----------|
| 느린 쿼리 | active=10, pending=30 | DB slow query log |
| 커넥션 누수 | active=10, pending=30 | leak detection 경고 |
| 트래픽 폭증 | active=10, pending=30 | 요청 수 급증 |

메트릭은 **"문제가 있다"**는 알려주지만 **"왜"**는 알려주지 않는다. 다른 메트릭과 조합해야 한다.

### 3. 알림 기준

| 조건 | 의미 | 대응 |
|------|------|------|
| `pending > 0` 30초 이상 | 풀 고갈 진행 중 | 슬로쿼리/누수 확인 |
| `active = maximumPoolSize` 지속 | 풀 완전 소진 | 즉시 대응 |
| `idle = 0` 지속 | 여유 커넥션 없음 | 트래픽 확인 |

---

## 구현

### 메트릭 갱신 시점

```
getConnection():
  pending++ → 대기 시작
  ... 커넥션 획득 성공 ...
  pending-- → 대기 종료
  active++  → 사용 중 증가
  idle--    → 유휴 감소

release():
  active--  → 사용 중 감소
  idle++    → 유휴 증가
```

### 초기값

생성자에서 커넥션 N개 생성 시:
- `total = N`
- `idle = N`
- `active = 0`
- `pending = 0`

### 모니터링 출력

`ScheduledExecutorService`로 1초마다:
```
[Pool] active=20 idle=0 pending=30 total=20
```

---

## 벤치마크 결과 (50스레드, 풀 20, iteration 1000)

```
[Pool] active=20 idle=0 pending=30 total=20   ← 풀 완전 소진
[Pool] active=20 idle=0 pending=30 total=20
[Pool] active=19 idle=1 pending=32 total=20   ← 커넥션 1개 반환
[Pool] active=18 idle=2 pending=14 total=20   ← 점차 회복
```

- `active=20, pending=30`: 20개 커넥션 전부 사용 중, 30개 스레드 대기
- 시간이 지나며 반환 → pending 감소 → 정상 복귀

---

## 인사이트

### 1. 메트릭은 "온도계"다

온도계가 38도를 가리키면 열이 있는 건 알지만, 감기인지 독감인지는 모른다. 풀 메트릭도 마찬가지 — "풀이 고갈됐다"는 알려주지만 원인은 다른 도구(slow query log, leak detection, 요청 수 모니터링)로 파악해야 한다.

### 2. pending이 가장 중요한 신호

- `active`가 높아도 `pending=0`이면 → 풀이 바쁘지만 감당 가능
- `pending > 0`이 지속되면 → **풀이 감당 못 하고 있음** → 즉시 확인 필요

### 3. HikariCP + Micrometer

프로덕션에서는 직접 `System.out`으로 찍지 않고:
- HikariCP + Micrometer 연동 → Prometheus 수집 → Grafana 대시보드
- `hikaricp_connections_active`, `hikaricp_connections_pending` 등 자동 노출
- Spring Boot Actuator + `/actuator/metrics`에서 바로 확인 가능

---

## 오늘의 핵심 한 줄

> **메트릭은 "문제가 있다"를 알려주고, pending 급증은 가장 긴급한 신호다. 하지만 "왜"는 다른 도구와 조합해야 안다.**
