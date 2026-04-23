# 커넥션 풀 직접 만들기 (2) — 실패율 69%에서 0%로

---

## 1. 이전 편 요약 + 이번 편 목표

- 1편에서 확인한 v1의 한계 3가지 요약
  - 풀이 비면 대기 없이 즉시 실패
  - synchronized = 글로벌 락
  - 커넥션 검증 없음
- 이번 글에서 해결할 것: CAS, Semaphore, 설정 튜닝, 누수 탐지, 메트릭

---

## 2. synchronized를 걷어내보자 — CAS

- v1 문제: synchronized로 모든 스레드가 한 줄로 대기
- PoolEntry 패턴: Connection + AtomicInteger(0=NOT_IN_USE, 1=IN_USE)
- CAS(Compare-And-Swap): 확인과 변경을 원자적으로 수행
- ThreadLocal 힌트: 마지막에 쓴 커넥션을 우선 시도
- 벤치마크 결과: v1(6,714/s, 69% 실패) vs v2(7,044/s, 69% 실패)
- **충격: 5% 빨라졌는데 실패율은 똑같다**

> [코드블록] CAS 기반 getConnection() 핵심 코드
> - compareAndSet(0, 1) 부분 강조

> [시각자료] v1 vs v2 벤치마크 비교 표
> | 버전 | 동기화 방식 | 처리량 | 실패율 |
> | v1   | synchronized | 6,714/sec | 69% |
> | v2   | ThreadLocal + CAS | 7,044/sec | 69% |

> [캡처자료] v2 벤치마크 콘솔 출력

---

## 3. 진짜 병목은 대기 메커니즘이었다 — Semaphore

- CAS로 바꿔도 실패율 동일 → 진짜 원인은 "풀 비면 즉시 포기"
- Polling(busy wait, CPU 낭비) vs Blocking(Semaphore, 효율적)
- Semaphore: tryAcquire(timeout)으로 시간 제한 대기
- 벤치마크: 69% 실패 → **0% 실패**
- "처리량 숫자가 높다고 좋은 게 아니다" — 성공 건수가 진짜 지표

> [코드블록] Semaphore 적용 getConnection()
> - tryAcquire(connectionTimeout, TimeUnit.MILLISECONDS) 부분

> [시각자료] 대기 메커니즘 추가 전후 비교 표
> | 버전 | 대기 | 처리량 | 실패율 |
> | v2 (CAS only) | 없음 | 7,044/sec | 69% |
> | v2 + Semaphore(30s) | 30초 | 3,602/sec | 0% |
> | v2 + Semaphore(100ms) | 100ms | 3,195/sec | 7% |

> [시각자료] connectionTimeout 트레이드오프 표
> - 짧게 (빠른 실패) vs 길게 (느리지만 ``성공)

> [캡처자료] Semaphore 적용 벤치마크 콘솔 출력

---

## 4. 설정이 성능을 바꾼다 — 핵심 파라미터

- maximumPoolSize를 2배로 올리면 성능이 2배가 되는가? → 아니다
- 벤치마크: pool=5/10/20/50 결과
- DB CPU 코어 수가 병렬 처리의 천장
- HikariCP 공식: connections = (core_count × 2) + effective_spindle_count
- 핵심 5개 파라미터: maximumPoolSize, connectionTimeout, minimumIdle, idleTimeout, maxLifetime
- minimumIdle = maximumPoolSize 권장 이유 (콜드스타트 방지)

> [시각자료] pool size별 성능 비교 표
> | pool | 처리량 |
> | 5    | 2,552/sec |
> | 10   | 8,124/sec |
> | 20   | 5,993/sec |
> | 50   | 7,230/sec |

> [시각자료] HikariCP 핵심 5개 파라미터 요약 표

---

## 5. 누수를 잡아라 — Leak Detection

- 커넥션 누수: getConnection() 후 release() 안 하면 영원히 IN_USE
- 감지 원리: getConnection() 시점에 Throwable 캡처 + 감시 스레드
- 왜 getConnection() 시점인가? → release()는 호출 안 되니까 거기서 캡처 불가
- 테스트 결과: 정확히 누수 코드 위치(Main.java:19)를 찍어줌
- leakDetectionThreshold 주의: 너무 짧으면 false positive, p99보다 길게 설정

> [코드블록] 누수 발생 예시 코드
> - release() 빠진 코드

> [캡처자료] leak detection 스택트레이스 출력
> - Main.java:19 정확히 찍히는 부분

---

## 6. 지금 풀 상태가 어때? — Metrics

- 4대 메트릭: active(사용 중), idle(대기 중), pending(기다리는 스레드), total(전체)
- pending > 0 지속 = 가장 긴급한 신호
- 같은 메트릭(active=10, pending=30)이라도 원인은 3가지 (느린 쿼리/누수/트래픽 폭증)
- 메트릭은 "온도계" — 문제는 알려주지만 원인은 안 알려줌

> [시각자료] 4대 메트릭 요약 표
> | 메트릭 | 의미 | 정상 | 위험 |

> [캡처자료] 벤치마크 중 메트릭 출력
> - active=20 idle=0 pending=30 total=20 → 풀 소진 상태

---

## 7. 다음 편 예고

- 지금까지: 풀을 만들고, 튜닝하고, 감시하는 법
- 다음 편: 프로덕션에서 실제로 터지는 시나리오들

> [시각자료] 다음 편 예고 표
> | 이번 편에서 만든 것 | 다음 편에서 터뜨릴 것 |
> | CAS + Semaphore | 커넥션 고갈 시나리오 |
> | 설정 튜닝 | maxLifetime 충돌 |
> | Leak Detection | 데드락 |

---


## 준비물 체크리스트

- [ ] v1 vs v2 벤치마크 콘솔 캡처 (CAS 전환)
- [ ] CAS getConnection() 핵심 코드 스니펫
- [ ] Semaphore 적용 벤치마크 콘솔 캡처
- [ ] Semaphore getConnection() 핵심 코드 스니펫
- [ ] pool size별(5/10/20/50) 벤치마크 콘솔 캡처
- [ ] HikariCP 핵심 5개 파라미터 표
- [ ] 누수 발생 코드 + leak detection 스택트레이스 캡처
- [ ] 메트릭 출력 콘솔 캡처 (active/idle/pending/total)
