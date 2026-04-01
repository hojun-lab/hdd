# HikariCP Deep-Dive Progress

> Learner: deepnoid
> Started: 2026-03-24
> Current: Week 2, Day 5

## Week 1: Foundations (Build: NaivePool)

| Day | Topic | Theory | Build | Date | Notes |
|-----|-------|--------|-------|------|-------|
| D1 | TCP/IP cost of DB connections | DEEP | COMPLETE | 2026-03-24 | avg=22ms, p50=17ms, p99=100ms, max=358ms. 서버측 비용 > 네트워크 비용 이해 |
| D2 | JDBC driver internals | DEEP | COMPLETE | 2026-03-24 | v0 baseline: 349 req/sec (50t), 250t에서 Too many connections 1773건 실패 |
| D3 | Connection pool lifecycle | DEEP | COMPLETE | 2026-03-25 | v1: pool=10 → 4769 req/sec, pool=50 → 2521 req/sec. v0 대비 13.6배. 풀 작을수록 빠름 발견 |
| D4 | HikariCP vs alternatives | DEEP | COMPLETE | 2026-03-26 | ThreadLocal+CAS vs synchronized 이해. v1 한계: 50t→80%실패, 200t→99%실패. 대기 메커니즘 부재 |
| D5 | HikariCP architecture | DEEP | COMPLETE | 2026-03-27 | v2 설계 완료: ThreadLocal→공유풀→대기→타임아웃 4단계 폴백. release 핸드오프 설계 |
| Mission | Lifecycle diagram + Benchmark report | - | - | - | - |

## Week 2: Internals & Tuning (Build: OptimizedPool)

| Day | Topic | Theory | Build | Date | Notes |
|-----|-------|--------|-------|------|-------|
| D1 | ConcurrentBag deep-dive | DEEP | COMPLETE | 2026-03-30 | v1: 6714/sec 69%실패, v2(CAS): 7044/sec 69%실패. 동기화 방식보다 대기 메커니즘이 핵심 |
| D2 | Connection acquisition flow | DEEP | COMPLETE | 2026-03-31 | Semaphore 대기 추가: 실패 69%→0%. timeout 30s vs 100ms 트레이드오프 확인 |
| D3 | Core config parameters | DEEP | COMPLETE | 2026-04-01 | pool=10 최적(8124/sec). 2배 올려도 2배 안 됨. connections=core×2 공식. PoolConfig 분리 |
| D4 | Leak detection & validation | DEEP | COMPLETE | 2026-04-01 | Leak Detector 구현: Throwable 캡처 + ScheduledExecutor + ConcurrentHashMap. 반복 경고 개선 과제 |
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
| v2 | Lock-free / ThreadLocal + Semaphore | COMPLETE | CAS only: 7044/sec 69%실패. +Semaphore(30s): 3602/sec 0%실패. +Semaphore(100ms): 3195/sec 7%실패 |
| v3 | + timeout + leak detection + metrics | IN-PROGRESS | Semaphore timeout + LeakDetector 완료. Metrics W2D5에서 추가 |
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
| HikariCP ConcurrentBag: ThreadLocal + CAS + SynchronousQueue | DEEP | D4 | 2026-03-26 |
| DBCP/c3p0의 synchronized vs HikariCP의 lock-free 차이 | DEEP | D4 | 2026-03-26 |
| 벤치마크 함정: 평시 성능 차이는 체감 불가, 극한상황에서 차이 발생 | DEEP | D4 | 2026-03-26 |
| 대기 메커니즘 없는 풀의 한계 (즉시 예외 → 대량 실패) | DEEP | D4 | 2026-03-26 |
| 4단계 폴백: ThreadLocal → 공유풀(CAS) → 대기 → 타임아웃 | DEEP | D5 | 2026-03-27 |
| isValid()로 stale 커넥션 사전 차단 | SURFACE | D5 | 2026-03-27 |
| release 시 핸드오프 vs 풀 반환 분기 | SURFACE | D5 | 2026-03-27 |
| ArrayDeque: 양끝 O(1) vs ArrayList.remove(0) O(n) | DEEP | D5 | 2026-03-27 |
| PoolEntry + AtomicInteger로 커넥션 상태 관리 | DEEP | W2D1 | 2026-03-30 |
| CAS(compareAndSet): 확인+변경을 원자적으로 | DEEP | W2D1 | 2026-03-30 |
| CAS 없이 get()+set() 분리하면 레이스 컨디션 발생 | DEEP | W2D1 | 2026-03-30 |
| ThreadLocal + CAS만으로는 부족 — 대기 메커니즘 필수 | DEEP | W2D1 | 2026-03-30 |
| Semaphore: tryAcquire(timeout)로 시간 기반 대기 | DEEP | W2D2 | 2026-03-31 |
| polling(busy wait) vs blocking(Semaphore/wait) 차이 | DEEP | W2D2 | 2026-03-31 |
| connectionTimeout 트레이드오프: 느린 성공 vs 빠른 실패 | DEEP | W2D2 | 2026-03-31 |
| maximumPoolSize: 올려도 선형 성능 향상 아님 (DB CPU 병목) | DEEP | W2D3 | 2026-04-01 |
| 공식: connections = core_count × 2 + spindle_count | DEEP | W2D3 | 2026-04-01 |
| minimumIdle = maximumPoolSize 권장 이유 (콜드스타트 방지) | DEEP | W2D3 | 2026-04-01 |
| maxLifetime: stale 커넥션 + DNS failover 방지 | SURFACE | W2D3 | 2026-04-01 |
| Leak Detection: getConnection() 시점에 Throwable 캡처 | DEEP | W2D4 | 2026-04-01 |
| ScheduledExecutorService로 주기적 감시 | DEEP | W2D4 | 2026-04-01 |
| ConcurrentHashMap으로 빌려간 커넥션 추적 | DEEP | W2D4 | 2026-04-01 |

> Theory Status: DEEP / SURFACE / NEEDS-REVIEW / NOT-STARTED
> Build Status: COMPLETE / IN-PROGRESS / NOT-STARTED
