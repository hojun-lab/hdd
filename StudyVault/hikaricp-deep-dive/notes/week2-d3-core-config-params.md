# Week 2, Day 3 — Core Config Parameters

> 날짜: 2026-04-01
> 주제: maximumPoolSize 튜닝 + HikariCP 핵심 설정 파라미터

---

## 핵심 개념

### 1. maximumPoolSize를 2배로 올리면 성능이 2배가 되는가?

**아니다.** 벤치마크로 직접 확인:

| 풀 사이즈 | 처리량 | 소요시간 |
|----------|--------|----------|
| 5 | 2,552/sec | 19.6s |
| **10** | **8,124/sec** | **6.2s** |
| 20 | 5,993/sec | 8.3s |
| 50 | 7,230/sec | 6.9s |

- 풀 사이즈 10이 최적
- 20으로 올리면 오히려 **느려짐**
- 50은 벤치마크 노이즈로 매번 달라짐

### 2. 왜 풀 사이즈를 올려도 성능이 안 오르는가?

DB 서버의 **CPU 코어 수**가 병렬 처리의 천장이다.

- CPU 4코어 → 진짜 동시에 실행되는 쿼리는 4개
- 나머지는 MySQL 내부에서 컨텍스트 스위칭
- 커넥션이 많아지면 → 스위칭 오버헤드만 증가

### 3. HikariCP 공식 풀 사이즈 공식

> **connections = (core_count × 2) + effective_spindle_count**

| DB 서버 | 계산 | 결과 |
|---------|------|------|
| 4코어, SSD | 4 × 2 + 0 | **8** |
| 8코어, SSD | 8 × 2 + 0 | **16** |
| 4코어, HDD 4개 | 4 × 2 + 4 | **12** |

### 4. HikariCP 핵심 설정 파라미터

| 파라미터 | 의미 | 기본값 | 잘못 건드리면 |
|---------|------|--------|-------------|
| `maximumPoolSize` | 최대 커넥션 수 | 10 | DB 서버 과부하, 컨텍스트 스위칭 |
| `connectionTimeout` | 커넥션 획득 대기 시간 | 30초 | 스레드 장시간 블로킹, 스레드풀 고갈 |
| `minimumIdle` | 유휴 상태 최소 커넥션 수 | = maximumPoolSize | 트래픽 몰릴 때 커넥션 생성 지연 |
| `idleTimeout` | 유휴 커넥션 유지 시간 | 10분 | 커넥션 빈번한 생성/삭제 |
| `maxLifetime` | 커넥션 최대 생존 시간 | 30분 | stale 커넥션, DNS failover 미반영 |

### 5. minimumIdle = maximumPoolSize 권장 이유

- minimumIdle을 낮게 설정하면 → 트래픽 급증 시 커넥션 신규 생성 필요
- 커넥션 1개 생성 = 22ms (D1에서 측정)
- minimumIdle=3, maximumPoolSize=10 → 7개 생성 = 154ms 지연
- **콜드스타트 방지**: 항상 maximumPoolSize만큼 유지하면 생성 지연 없음

---

## Build Track: PoolConfig 분리

설정값을 record로 분리하여 벤치마크 시 값만 바꿔서 테스트 가능하게 리팩토링:

```java
record PoolConfig(
    int maximumPoolSize,
    long connectionTimeoutMs,
    long leakDetectionThresholdMs
)
```

---

## 인사이트

### 1. "풀 고갈 → 풀 사이즈 올리자"는 대부분 틀린 처방

프로덕션에서 흔히 하는 실수:
- 커넥션 풀 고갈됐다 → maximumPoolSize 올리자 → **문제 안 풀림**
- 진짜 원인: 느린 쿼리, 커넥션 누수, 트랜잭션 범위 과다

### 2. 최적 풀 사이즈는 "작을수록 좋다"

- 필요 이상으로 크면: DB 부하 ↑, 메모리 낭비 ↑, 경합 ↑
- 공식 기반으로 설정하고, 모니터링으로 검증

---

## 오늘의 핵심 한 줄

> **maximumPoolSize를 2배로 올려도 성능은 2배가 안 된다. DB CPU 코어 수가 천장이고, 공식은 connections = core × 2.**
