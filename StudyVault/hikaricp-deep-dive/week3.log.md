# 커넥션 풀 직접 만들기 (3) — 프로덕션은 터진다

---

## 1. 이전 요약과 목표

- 2편에서 달성한 것 요약
  - CAS로 synchronized 제거, Semaphore로 실패율 69% → 0%
  - 핵심 파라미터(maximumPoolSize, connectionTimeout, minimumIdle, idleTimeout, maxLifetime) 정리
  - Leak Detector + 4대 메트릭(active/idle/pending/total) 구현
- 이번 편에서 할 것: **풀을 직접 터뜨린다** (BreakIt)
  - 2편까지는 "어떻게 잘 만드는가", 이번 편은 "실제로 뭐가 터지는가"
  - 3가지 프로덕션 장애 시나리오 + 회고로 마무리

> [시각자료] 2편 vs 3편 비교 표
> | 2편(만들기) | 3편(터뜨리기) |
> | CAS + Semaphore | 커넥션 고갈 3패턴 |
> | 설정 튜닝 | REQUIRES_NEW 데드락 |
> | Leak Detection / Metrics | maxLifetime 충돌 / isValid 전략 |

---

## 2. 풀은 왜 고갈되는가 — 같은 증상, 다른 원인

- 풀 고갈의 3가지 패턴 (메트릭은 비슷하지만 원인은 다름)
  - **느린 쿼리**: 일시적으로 active 치솟음 → 쿼리 끝나면 회복
  - **트래픽 폭증**: pending 급증하지만 Semaphore 대기로 빠르게 소화
  - **커넥션 누수**: active가 **절대 안 내려감** + Leak Detector 경고 발생
- 같은 `active=10, pending=30`이라도 원인이 3가지 — 메트릭만 보고 판단 불가
- 각 시나리오 재현 코드(느린 쿼리 sleep 5초, 누수 = release 생략) + 관찰 결과
- 실무 교훈: 메트릭은 "문제가 있다"는 신호일 뿐, 원인은 **추세 + 로그 + Leak Detector**로 구분

> [코드블록] 고갈 시나리오 3종 재현 코드 (느린 쿼리 / 폭증 / 누수)
> - `Thread.sleep(5000)`으로 느린 쿼리 재현
> - release() 생략으로 누수 재현

> [시각자료] 고갈 3패턴 비교 표
> | 원인 | active 추세 | pending 추세 | 회복 여부 | 감지 신호 |
> | 느린 쿼리 | 순간 상승 | 순간 상승 | 자동 회복 | 쿼리 로그 |
> | 트래픽 폭증 | 꽉참 유지 | 상승 후 감소 | 트래픽 감소 시 회복 | QPS 추세 |
> | 누수 | **영구 고정** | 점점 누적 | **회복 안 됨** | Leak Detector 경고 |

> [캡처자료] 3가지 시나리오별 메트릭 출력 캡처

**에셋 필요**: `assets/pool-exhaustion-3-patterns.svg` (3패턴을 시간축으로 그린 비교 그래프)

---

## 3. 풀이 있어도 데드락은 걸린다 — REQUIRES_NEW의 함정

- "풀 사이즈 충분한데 왜 데드락?"이라는 반전 훅
- 재현 조건: `maximumPoolSize=2`, 2개 스레드가 각자 커넥션 2개씩 필요
  - 스레드 A: 첫 커넥션 획득 → 내부 트랜잭션에서 두 번째 커넥션 요청 (REQUIRES_NEW)
  - 스레드 B: 똑같이 첫 커넥션 획득 → 두 번째 요청 대기
  - 결과: **active=2, pending=2 영구 고정** — 둘 다 서로가 놓기를 기다림
- 왜 이런 상황이 실제로 생기는가? → `@Transactional(propagation = REQUIRES_NEW)`이 대표적
- 방지 3가지
  - REQUIRES_NEW 금지 (가능한 한)
  - 풀 사이즈 공식: 스레드당 최대 필요 커넥션 × 스레드 수
  - 별도 풀 분리 (외부 호출용 풀과 내부 트랜잭션용 풀)

> [코드블록] 데드락 재현 코드 (2개 커넥션을 동시에 요청하는 스레드 2개)

> [mermaid] 데드락 시퀀스 다이어그램
> - 스레드 A/B가 서로 2번째 커넥션을 기다리는 구조

> [캡처자료] 데드락 걸린 메트릭 출력 (active=2 pending=2 무한 유지)

**에셋 필요**: `assets/pool-deadlock-sequence.svg` (데드락 시퀀스 다이어그램 — Thread A/B와 Pool(size=2) 관계)

---

## 4. maxLifetime은 왜 필요한가 — 조용히 죽은 커넥션

- "풀에 있는데 왜 에러?" — **stale connection** 문제
- 원인: DB(MySQL `wait_timeout` 기본 28800초=8시간)가 유휴 커넥션을 먼저 끊음
  - 애플리케이션은 모름 → 풀은 "살아있는 커넥션"으로 믿고 대여
  - 쿼리 보내면 `Communications link failure` 에러
- 해결: maxLifetime을 **DB wait_timeout보다 짧게** 설정하여 애플리케이션이 먼저 교체
  - HikariCP 기본값: 1,800,000ms(30분)
  - 권장: DB wait_timeout보다 최소 30초 짧게
- **새로운 문제 — 동시 만료**
  - 풀이 동시에 생성됐다면 maxLifetime도 동시에 도래 → 순간적으로 전체 커넥션 폐기 → 순간 고갈
  - 해결: **jitter** (만료 시각에 랜덤 오프셋 추가)
- replaceConnection 구현: 기존 커넥션 폐기 → 새 커넥션 생성 → sharedList 교체

> [코드블록] replaceConnection 핵심 로직
> - maxLifetime 체크 + jitter 계산
> - 폐기 → 신규 생성 → 리스트 교체

> [시각자료] maxLifetime vs wait_timeout 관계도
> | 설정 | 값 | 의미 |
> | MySQL wait_timeout | 28,800s (8h) | DB가 유휴 커넥션 강제 종료 |
> | HikariCP maxLifetime | 1,800s (30min) | 애플리케이션이 먼저 교체 |
> | 권장 gap | 최소 30s 이상 | 경계 타이밍 충돌 방지 |

> [시각자료] jitter 적용 전후 만료 분포
> - 적용 전: 같은 시점에 10개 동시 만료
> - 적용 후: ±N초 범위로 분산

**에셋 필요**: `assets/maxlifetime-jitter.svg` (동시 만료 vs jitter 적용 분포 비교 그래프)

---

## 5. isValid()는 언제 부를 것인가 — borrow vs return

- stale 커넥션을 막는 또 하나의 방어선: 매번 검증(`isValid()`)
- 문제: **언제 검증하느냐**에 따라 성능/안전성 트레이드오프
  - **borrow-time(대여 시)**: 스레드가 받을 때마다 검증 → 안전하지만 매 요청에 네트워크 왕복 비용
  - **return-time(반환 시)**: 반환 시점에 검증 → 대여는 빠름, 단 유휴 시간 동안 죽을 가능성
- HikariCP 선택: **기본적으로 return-time 검증** (성능 우선)
  - 추가로 유휴 커넥션 대상으로 주기적 검증 (`keepaliveTime`)
  - 대여 시점 검증은 opt-in
- 본인의 MiniPool에서 두 전략 모두 구현하고 벤치마크 비교
- **3중 방어 구조 완성**
  1. maxLifetime: 주기적 교체
  2. isValid(): 경계 지점 검증
  3. LeakDetector: 반환 안 된 커넥션 감지

> [코드블록] borrow-time 검증 vs return-time 검증 구현 비교

> [시각자료] borrow vs return 검증 트레이드오프 표
> | 시점 | 장점 | 단점 | HikariCP |
> | borrow-time | 안전 | 매 요청 오버헤드 | opt-in |
> | return-time | 빠름 | 유휴 중 죽음 리스크 | 기본 |

> [시각자료] 3중 방어 구조도
> - maxLifetime(예방) → isValid(검증) → LeakDetector(감지)

**에셋 필요**: `assets/isvalid-borrow-vs-return.svg` (두 시점의 검증 흐름 시퀀스)
**에셋 필요**: `assets/triple-defense.svg` (3중 방어 레이어 다이어그램)

---

## 6. 최종 벤치마크 — 내 MiniPool vs HikariCP

- 3주간 만든 MiniPool(v4: CAS + Semaphore + Leak + Metrics + maxLifetime + isValid)을 HikariCP와 같은 조건에서 벤치마크
- 측정 조건: 50스레드 × 1000회 반복, pool=10, MySQL 8
- 예상 결과: HikariCP가 여전히 더 빠름 → **왜인가?**
- "내가 놓친 최적화" 목록
  - **FastList**: ArrayList의 range-check 제거한 커스텀 자료구조
  - **ConcurrentBag**의 핸드오프 최적화 (`SynchronousQueue` 활용)
  - **prepStmtCache**: `cachePrepStmts`, `prepStmtCacheSize`, `prepStmtCacheSqlLimit` 조합
    - MySQL: 클라이언트 측 캐시 활용도 높음
    - PostgreSQL: 서버 측 prepare로 동작이 다름
  - **byte-code manipulation**: `com.zaxxer.hikari.util.JavassistProxyFactory`로 invokeinterface 오버헤드 제거
  - **housekeeper**: 유휴 커넥션 관리 전용 스레드
- 결론: **속도는 "자료구조 + 캐시 + 바이트코드 레벨 최적화의 총합"**

> [코드블록] 최종 벤치마크 하네스

> [시각자료] MiniPool v4 vs HikariCP 비교 표
> | 조건 | MiniPool v4 | HikariCP | 차이 |
> | 처리량 | TBD | TBD | TBD% |
> | p99 latency | TBD | TBD | TBD |
> | 실패율 | TBD | TBD | TBD |

> [시각자료] 놓친 최적화 체크리스트
> | 기법 | MiniPool | HikariCP |
> | FastList | ❌ | ✅ |
> | ThreadLocal 핸드오프 | ✅ | ✅ (더 정교함) |
> | prepStmtCache | ❌ | ✅ |
> | Javassist 프록시 | ❌ | ✅ |

> [캡처자료] 최종 벤치마크 콘솔 출력

**에셋 필요**: `assets/minipool-vs-hikaricp-benchmark.svg` (처리량/지연/실패율 3축 비교 차트)

---

## 7. 회고 — 3주간 만들면서 배운 것

- **HikariCP가 나보다 잘한 것**
  - 자료구조: ArrayList가 아닌 FastList, CopyOnWriteArrayList 적재적소 활용
  - 대기 메커니즘: Semaphore뿐 아니라 `SynchronousQueue` 핸드오프로 반환 즉시 전달
  - 생명주기 관리: housekeeper 스레드가 maxLifetime + idleTimeout + keepalive를 한 곳에서 처리
  - 바이트코드 수준 최적화: Javassist로 인터페이스 호출 오버헤드 제거
- **만들면서 깨달은 것**
  - 풀은 단순한 캐시가 아니라 **동시성 + 자원 관리 + 장애 대응의 집합체**
  - "빠르다"의 정의가 처리량이 아니라 **실패 없이 꾸준한 처리량**
  - 메트릭만으로는 원인 파악 불가, 로그 + 스택트레이스 캡처가 필수
  - 커넥션 풀 설정은 **DB/인프라와의 계약** (wait_timeout, core_count)
- **이제 HikariCP 설정값을 볼 때 달라진 관점**
  - 예전: "기본값 쓰면 되지"
  - 지금: maximumPoolSize를 볼 때 DB core_count를, maxLifetime을 볼 때 wait_timeout을, connectionTimeout을 볼 때 스레드풀 크기를 함께 본다
- **마무리**
  - 3주간 v0 → v1 → v2 → v3 → v4까지 MiniPool을 빌드
  - HikariCP를 "쓰는 법"이 아니라 **"왜 그렇게 설계됐는지"**를 이해함
  - 프로덕션에서 커넥션 풀 장애가 터져도 이제 원인부터 따진다

> [시각자료] 3주간 빌드 여정
> | 버전 | 추가된 것 | 해결한 문제 |
> | v0 | (풀 없음) | baseline |
> | v1 | ArrayList + synchronized | 재사용 |
> | v2 | ThreadLocal + CAS + Semaphore | 동시성 + 실패율 |
> | v3 | timeout + Leak + Metrics | 가시성 |
> | v4 | maxLifetime + isValid | stale 방지 |

> [시각자료] 관점 변화 Before/After 표
> | 설정 | Before(그냥 씀) | After(이렇게 본다) |
> | maximumPoolSize | 10 정도? | DB core × 2 공식 확인 |
> | maxLifetime | 기본값 | DB wait_timeout - 30s |
> | connectionTimeout | 30000 | 스레드풀 크기 고려 |
> | leakDetectionThreshold | 안 씀 | p99 응답시간 + 여유 |

**에셋 필요**: `assets/3week-build-journey.svg` (v0→v4 타임라인 그래프, 각 단계 성능/실패율 표시)

---

## 준비물 체크리스트

### 코드/캡처
- [ ] 고갈 3시나리오 재현 코드 (느린쿼리/폭증/누수)
- [ ] 고갈 3패턴 메트릭 캡처 (각각 콘솔 출력)
- [ ] 데드락 재현 코드 (pool=2, 2스레드×2커넥션)
- [ ] 데드락 메트릭 캡처 (active=2 pending=2 고정)
- [ ] replaceConnection 핵심 코드
- [ ] jitter 적용 전/후 만료 로그 캡처
- [ ] borrow-time vs return-time isValid 구현 코드
- [ ] MiniPool v4 vs HikariCP 최종 벤치마크 콘솔 캡처

### 에셋 (SVG/PNG)
- [ ] `assets/pool-exhaustion-3-patterns.svg` — 고갈 3패턴 시간축 비교
- [ ] `assets/pool-deadlock-sequence.svg` — 데드락 시퀀스 다이어그램
- [ ] `assets/maxlifetime-jitter.svg` — 동시 만료 vs jitter 분산
- [ ] `assets/isvalid-borrow-vs-return.svg` — 검증 시점 비교 시퀀스
- [ ] `assets/triple-defense.svg` — 3중 방어 레이어
- [ ] `assets/minipool-vs-hikaricp-benchmark.svg` — 최종 벤치마크 차트
- [ ] `assets/3week-build-journey.svg` — 3주 빌드 타임라인

### 표
- [ ] 2편 vs 3편 비교 표
- [ ] 고갈 3패턴 비교 표
- [ ] maxLifetime vs wait_timeout 관계 표
- [ ] borrow vs return 트레이드오프 표
- [ ] MiniPool v4 vs HikariCP 벤치마크 표
- [ ] 놓친 최적화 체크리스트
- [ ] 3주 빌드 여정 표
- [ ] 관점 변화 Before/After 표
