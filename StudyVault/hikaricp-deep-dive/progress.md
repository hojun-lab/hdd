# HikariCP Deep-Dive Progress

> Learner: deepnoid
> Started: 2026-03-24
> Current: Week 1, Day 4

## Week 1: Foundations (Build: NaivePool)

| Day | Topic | Theory | Build | Date | Notes |
|-----|-------|--------|-------|------|-------|
| D1 | TCP/IP cost of DB connections | DEEP | COMPLETE | 2026-03-24 | avg=22ms, p50=17ms, p99=100ms, max=358ms. 서버측 비용 > 네트워크 비용 이해 |
| D2 | JDBC driver internals | DEEP | COMPLETE | 2026-03-24 | v0 baseline: 349 req/sec (50t), 250t에서 Too many connections 1773건 실패 |
| D3 | Connection pool lifecycle | DEEP | COMPLETE | 2026-03-25 | v1: pool=10 → 4769 req/sec, pool=50 → 2521 req/sec. v0 대비 13.6배. 풀 작을수록 빠름 발견 |
| D4 | HikariCP vs alternatives | - | - | - | - |
| D5 | HikariCP architecture | - | - | - | - |
| Mission | Lifecycle diagram + Benchmark report | - | - | - | - |

## Week 2: Internals & Tuning (Build: OptimizedPool)

| Day | Topic | Theory | Build | Date | Notes |
|-----|-------|--------|-------|------|-------|
| D1 | ConcurrentBag deep-dive | - | - | - | - |
| D2 | Connection acquisition flow | - | - | - | - |
| D3 | Core config parameters | - | - | - | - |
| D4 | Leak detection & validation | - | - | - | - |
| D5 | Metrics & monitoring | - | - | - | - |
| Mission | Config defense + Benchmark report | - | - | - | - |

## Week 3: Production Mastery (Build: BreakIt)

| Day | Topic | Theory | Build | Date | Notes |
|-----|-------|--------|-------|------|-------|
| D1 | Connection exhaustion | - | - | - | - |
| D2 | Deadlock & pool starvation | - | - | - | - |
| D3 | maxLifetime vs infra timeout | - | - | - | - |
| D4 | Multi-datasource routing | - | - | - | - |
| D5 | Performance tuning | - | - | - | - |
| Mission | Incident diagnosis + MiniPool retrospective | - | - | - | - |

## Build Versions

| Version | Description | Status | Benchmark Result |
|---------|-------------|--------|-----------------|
| v0 | No pool (baseline) | COMPLETE | 50t/100i: 349 req/sec, 14.3s, 0 fail. 250t/200i: 230 req/sec, 217s, 1773 fail |
| v1 | ArrayList + synchronized | COMPLETE | pool=10: 4769 req/sec, pool=50: 2521 req/sec (50t/100i) |
| v2 | Lock-free / ThreadLocal | - | - |
| v3 | + timeout + leak detection + metrics | - | - |
| v4 | + maxLifetime + validation | - | - |
| Final | vs HikariCP benchmark | - | - |

## Concept Mastery

| Concept | Status | First Seen | Last Reviewed |
|---------|--------|------------|---------------|
| TCP 3-way handshake | DEEP | D1 | 2026-03-24 |
| MySQL 프로토콜 handshake (Greeting → Auth → Session Init) | DEEP | D1 | 2026-03-24 |
| 커넥션 생성 비용 구성 (네트워크 vs 서버 처리) | DEEP | D1 | 2026-03-24 |
| JVM warm-up (클래스 로딩 + JIT) | SURFACE | D1 | 2026-03-24 |
| 벤치마크 통계 (p50, p99, avg, max) | DEEP | D1 | 2026-03-24 |
| JDBC SPI (ServiceLoader) 드라이버 자동 등록 | SURFACE | D2 | 2026-03-24 |
| DriverManager 내부 흐름 (acceptsURL → connect) | DEEP | D2 | 2026-03-24 |
| connection.close() = 소켓 종료 + 서버 스레드 해제 | DEEP | D2 | 2026-03-24 |
| max_connections 초과 시 Too many connections 에러 | DEEP | D2 | 2026-03-24 |
| 커넥션 풀 = 재사용으로 생성 비용 제거 | DEEP | D3 | 2026-03-25 |
| synchronized로 레이스 컨디션 방지 | DEEP | D3 | 2026-03-25 |
| 풀 사이즈 ≠ 클수록 좋음 (초기화 비용 + 경합) | DEEP | D3 | 2026-03-25 |
| 커넥션 점유 시간이 짧으면 소수 커넥션으로 다수 스레드 감당 가능 | DEEP | D3 | 2026-03-25 |

> Theory Status: DEEP / SURFACE / NEEDS-REVIEW / NOT-STARTED
> Build Status: COMPLETE / IN-PROGRESS / NOT-STARTED
