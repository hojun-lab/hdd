# Week 1, Day 1 — DB 커넥션의 TCP/IP 비용

> 날짜: 2026-03-24
> 주제: 커넥션 하나를 맺는 데 실제로 어떤 일이 일어나는가?

---

## 핵심 개념

### 1. 커넥션 생성은 2단계다

| 단계 | 레이어 | 내용 | 왕복 횟수 |
|------|--------|------|-----------|
| TCP 3-way handshake | Transport (L4) | SYN → SYN-ACK → ACK | 1.5 RT |
| MySQL 프로토콜 handshake | Application (L7) | Greeting → Auth → Session Init | 3~4+ RT |

**TCP 연결이 완료되어도 바로 쿼리를 날릴 수 없다.** MySQL 프로토콜 레벨의 추가 과정이 필요하다.

### 2. MySQL 프로토콜 handshake 상세

```
[TCP 연결 완료]
     │
     ▼
① MySQL → Client : Greeting Packet (서버 버전, capability flags, 인증용 salt)
     │
     ▼
② Client → MySQL : Auth Response (username + password를 salt로 해싱)
     │
     ▼
③ MySQL → Client : OK / ERR
     │
     ▼
④ Session 초기화 (각각 1 round-trip)
   - SET character_set_results=utf8mb4
   - SET autocommit=1
   - SET sql_mode=...
   - SET timezone (serverTimezone=Asia/Seoul)
```

- SSL/TLS 사용 시 TLS handshake가 ②번 전에 추가 (1~2 RT 추가)
- **총 최소 4~6번의 네트워크 왕복**

### 3. MySQL 서버 측 비용

커넥션 하나당 MySQL이 하는 일:
- **전용 스레드 할당** (thread-per-connection 모델)
- **메모리 할당** (세션 버퍼, sort_buffer, join_buffer 등)
- **인증 처리** (mysql.user 테이블 조회, 권한 확인)
- **세션 변수 초기화**
- `max_connections` 기본값: **151개** (이 이상 동시 연결 시 거부)

### 4. JDBC URL 파라미터는 언제 적용되는가?

```
jdbc:mysql://localhost:13306/pooltest?useSSL=false&characterEncoding=UTF-8&serverTimezone=Asia/Seoul
```

이 파라미터들은 **커넥션을 맺는 시점(Session 초기화 단계)**에 SET 명령으로 적용된다. 즉, 파라미터가 많을수록 초기화에 더 많은 round-trip이 발생한다.

---

## 벤치마크 결과

> 환경: Docker MySQL 8.0 (localhost:13306), Java 21, 1000회 반복

| 지표 | 나노초 | 밀리초 | 의미 |
|------|--------|--------|------|
| **AVG** | 22,323,673 | ~22ms | 평균 커넥션 생성 비용 |
| **p50** | 16,871,000 | ~17ms | 절반의 커넥션이 이 시간 내 생성 |
| **p99** | 99,622,000 | ~100ms | 100번 중 1번은 이 이상 걸림 |
| **MAX** | 357,992,900 | ~358ms | 최악의 경우 |

### 해석

- localhost임에도 **평균 22ms** → 대부분이 MySQL 서버 측 처리 비용
- p99(100ms)와 p50(17ms)의 차이가 6배 → 커넥션 생성은 **불안정한 작업**
- 프로덕션(cross-AZ)이면 네트워크 왕복 비용(3~6ms)이 추가됨

### 프로덕션 임팩트 시뮬레이션

| 시나리오 | 계산 | 비용 |
|----------|------|------|
| 요청 1건, 쿼리 3회 (풀 없음) | 22ms × 3 | **66ms** (커넥션만) |
| 동시 1000명, 초당 3000 커넥션 생성 | max_connections=200 초과 | **Connection Refused** |
| p99 케이스에서 쿼리 3회 | 100ms × 3 | **300ms** (SLA 위반 가능) |

---

## JVM Warm-up

벤치마크 시 첫 번째 측정값이 나머지보다 크게 높은 이유:

1. **클래스 로딩**: `com.mysql.cj.jdbc.Driver` 클래스를 처음 로드할 때 Metaspace에 적재. 이후 호출에서는 이미 로드되어 있음
2. **JIT 컴파일**: JVM이 처음에는 인터프리터로 실행하다가, 반복되는 코드 경로를 네이티브 코드로 컴파일 (HotSpot C1/C2 컴파일러)

**대응**: 벤치마크 본 측정 전에 warm-up 루프(10~50회)를 돌려서 클래스 로딩과 JIT 컴파일을 미리 수행. warm-up 결과는 기록하지 않음.

---

## 오늘의 핵심 한 줄

> **커넥션 하나 맺는 데 22ms. 풀이 없으면 모든 요청이 이 비용을 매번 지불한다.**

---

## 다음 학습 (D2)

- JDBC `DriverManager.getConnection()` 내부에서 실제로 무슨 일이 일어나는가?
- 풀 없이 동시 스레드 50개로 부하를 걸면 어떤 일이 벌어지는가? (NaivePool v0 구현)
