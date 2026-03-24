# Week 1, Day 2 — JDBC Driver Internals + NaivePool v0

> 날짜: 2026-03-24
> 주제: DriverManager.getConnection() 내부 동작 + 풀 없는 세계의 한계

---

## 핵심 개념

### 1. DriverManager.getConnection() 내부 흐름

```
DriverManager.getConnection(url, user, password)
    │
    ▼
① 등록된 드라이버 목록 순회
    │
    ▼
② 각 드라이버에 acceptsURL(url) 호출
   - MySQL 드라이버: "jdbc:mysql://" 로 시작하면 true
   - PostgreSQL 드라이버: "jdbc:postgresql://" 로 시작하면 true
    │
    ▼
③ 매칭된 드라이버의 connect(url, properties) 호출
    │
    ▼
④ 소켓 생성 → TCP handshake → MySQL 프로토콜 handshake → 세션 초기화
    │
    ▼
⑤ Connection 객체 반환
```

### 2. 드라이버는 어떻게 등록되는가? — SPI

- Java 6 이전: `Class.forName("com.mysql.jdbc.Driver")` 명시 호출 필요
- Java 6 이후: **SPI(Service Provider Interface)** 자동 등록
- JAR 내부 `META-INF/services/java.sql.Driver` 파일에 드라이버 클래스명이 기록됨
- JVM이 클래스패스를 스캔하여 자동으로 `DriverManager`에 등록

### 3. connection.close()의 의미

- 풀 없는 환경: `close()` = **물리적 소켓 종료** (TCP FIN)
- MySQL 서버 측: 해당 스레드 해제 + 메모리 반환
- **22ms 들여서 만든 커넥션을 즉시 파괴하는 행위**

---

## 벤치마크 결과: NaivePool v0 (풀 없음)

### 테스트 조건
- 각 스레드가 N번 반복: `getConnection()` → `SELECT 1` → `close()`
- MySQL: Docker localhost:13306, `max_connections=200`

### 결과

| 시나리오 | 스레드 | iterations/thread | 총 요청 | 소요시간 | 처리량 | 실패 |
|----------|--------|-------------------|---------|----------|--------|------|
| 정상 부하 | 50 | 100 | 5,000 | 14.3s | **349 req/sec** | 0 |
| 과부하 | 250 | 200 | 50,000 | 217s | **230 req/sec** | 1,773 |

### 분석

#### 왜 50스레드에서 요청당 2.87ms인가? (D1에서는 22ms였는데)
- D1은 **단일 스레드** 순차 실행 → 커넥션 생성 동안 CPU가 대기
- D2는 **50스레드 병렬** → 한 스레드가 MySQL 응답 대기 중에 다른 스레드가 커넥션 생성
- 벽시계 시간(wall-clock time)이 병렬성 덕분에 단축됨

#### 왜 250스레드가 50스레드보다 느린가?
- `max_connections=200` 초과 → **Too many connections** 에러 발생
- 실패한 요청도 네트워크 비용 소모 (연결 시도 → 거부 → 예외)
- 250개 스레드의 컨텍스트 스위칭 오버헤드
- MySQL 서버 측 스레드 경합 증가

#### Too many connections 에러
```
SQL-server rejected establishment of SQL-connection
message from server: "Too many connections"
```
- MySQL이 `max_connections` 한도에 도달하면 새 연결 자체를 거부
- 프로덕션에서는 **500 Internal Server Error**로 이어짐
- 풀이 없으면 동시 요청 수 = 동시 커넥션 수 → 제어 불가능

---

## 풀 없는 세계의 문제점 정리

| 문제 | 설명 |
|------|------|
| **비용 낭비** | 매 요청마다 22ms 들여 커넥션 생성 후 즉시 파괴 |
| **max_connections 초과** | 동시 요청이 많으면 DB가 연결 자체를 거부 |
| **제어 불가** | 동시 커넥션 수를 애플리케이션이 제어할 방법이 없음 |
| **연쇄 장애** | 느린 쿼리 하나가 커넥션을 오래 잡으면 다른 요청도 실패 |
| **스케일링 역효과** | 스레드를 늘려도 성능이 오히려 떨어짐 (349 → 230 req/sec) |

---

## 오늘의 핵심 한 줄

> **풀 없이 스레드를 늘리면 성능이 좋아지는 게 아니라, DB가 죽는다.**

---

## 다음 학습 (D3)

- 이 문제를 해결하기 위해 Connection Pool 개념 도입
- MiniPool v1 구현: `ArrayList<Connection>` + `synchronized`로 가장 단순한 풀 만들기
- v0 vs v1 벤치마크 비교
