import { useState } from 'react'

const concepts = [
  { name: 'TCP 3-way handshake', status: 'DEEP', day: 'D1' },
  { name: 'MySQL 프로토콜 handshake (Greeting → Auth → Session Init)', status: 'DEEP', day: 'D1' },
  { name: '커넥션 생성 비용 (네트워크 vs 서버 처리)', status: 'DEEP', day: 'D1' },
  { name: 'JVM warm-up (클래스 로딩 + JIT)', status: 'SURFACE', day: 'D1' },
  { name: '벤치마크 통계 (p50, p99, avg, max)', status: 'DEEP', day: 'D1' },
  { name: 'JDBC SPI 드라이버 자동 등록', status: 'SURFACE', day: 'D2' },
  { name: 'DriverManager 내부 흐름 (acceptsURL → connect)', status: 'DEEP', day: 'D2' },
  { name: 'connection.close() = 소켓 종료 + 서버 스레드 해제', status: 'DEEP', day: 'D2' },
  { name: 'max_connections 초과 시 Too many connections', status: 'DEEP', day: 'D2' },
  { name: '커넥션 풀 = 재사용으로 생성 비용 제거', status: 'DEEP', day: 'D3' },
  { name: 'synchronized로 레이스 컨디션 방지', status: 'DEEP', day: 'D3' },
  { name: '풀 사이즈 ≠ 클수록 좋음 (초기화 비용 + 경합)', status: 'DEEP', day: 'D3' },
  { name: '커넥션 점유 시간이 짧으면 소수 커넥션으로 다수 스레드 감당', status: 'DEEP', day: 'D3' },
  { name: 'HikariCP ConcurrentBag: ThreadLocal + CAS + SynchronousQueue', status: 'DEEP', day: 'D4' },
  { name: 'DBCP/c3p0의 synchronized vs HikariCP lock-free 차이', status: 'DEEP', day: 'D4' },
  { name: '벤치마크 함정: 평시 성능 차이 체감 불가, 극한상황에서 차이', status: 'DEEP', day: 'D4' },
  { name: '대기 메커니즘 없는 풀의 한계 (즉시 예외 → 대량 실패)', status: 'DEEP', day: 'D4' },
  { name: '4단계 폴백: ThreadLocal → 공유풀(CAS) → 대기 → 타임아웃', status: 'DEEP', day: 'D5' },
  { name: 'isValid()로 stale 커넥션 사전 차단', status: 'SURFACE', day: 'D5' },
  { name: 'release 시 핸드오프 vs 풀 반환 분기', status: 'SURFACE', day: 'D5' },
  { name: 'ArrayDeque: 양끝 O(1) vs ArrayList.remove(0) O(n)', status: 'DEEP', day: 'D5' },
  { name: 'PoolEntry + AtomicInteger로 커넥션 상태 관리', status: 'DEEP', day: 'W2D1' },
  { name: 'CAS(compareAndSet): 확인+변경을 원자적으로', status: 'DEEP', day: 'W2D1' },
  { name: 'CAS 없이 get()+set() 분리하면 레이스 컨디션', status: 'DEEP', day: 'W2D1' },
  { name: 'ThreadLocal + CAS만으로는 부족 — 대기 메커니즘 필수', status: 'DEEP', day: 'W2D1' },
  { name: 'Semaphore: tryAcquire(timeout)로 시간 기반 대기', status: 'DEEP', day: 'W2D2' },
  { name: 'polling(busy wait) vs blocking(Semaphore) 차이', status: 'DEEP', day: 'W2D2' },
  { name: 'connectionTimeout: 느린 성공 vs 빠른 실패 트레이드오프', status: 'DEEP', day: 'W2D2' },
  { name: 'maximumPoolSize: 올려도 선형 향상 아님 (DB CPU 병목)', status: 'DEEP', day: 'W2D3' },
  { name: 'connections = core_count × 2 + spindle_count 공식', status: 'DEEP', day: 'W2D3' },
  { name: 'minimumIdle = maximumPoolSize 권장 (콜드스타트 방지)', status: 'DEEP', day: 'W2D3' },
  { name: 'maxLifetime: stale 커넥션 + DNS failover 방지', status: 'SURFACE', day: 'W2D3' },
  { name: 'Leak Detection: getConnection() 시점 Throwable 캡처', status: 'DEEP', day: 'W2D4' },
  { name: 'ScheduledExecutorService로 주기적 감시', status: 'DEEP', day: 'W2D4' },
  { name: 'ConcurrentHashMap으로 빌려간 커넥션 추적', status: 'DEEP', day: 'W2D4' },
  { name: '풀 메트릭: active/idle/pending/total', status: 'DEEP', day: 'W2D5' },
  { name: '메트릭만으로 근본 원인 파악 불가', status: 'DEEP', day: 'W2D5' },
  { name: 'pending 급증 = 풀 고갈 신호 → 알림 설정', status: 'DEEP', day: 'W2D5' },
]

const Badge = ({ status }) => {
  const cls = { DEEP: 'badge-deep', SURFACE: 'badge-surface', NOT_STARTED: 'badge-not-started' }
  return <span className={`badge ${cls[status]}`}>{status}</span>
}

export default function ConceptView() {
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const filtered = concepts.filter(c => {
    if (filter !== 'ALL' && c.status !== filter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const deepCount = concepts.filter(c => c.status === 'DEEP').length
  const surfaceCount = concepts.filter(c => c.status === 'SURFACE').length
  const days = [...new Set(concepts.map(c => c.day))]

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-widget">
          <div className="stat-value">{concepts.length}</div>
          <div className="stat-label">Total Concepts</div>
        </div>
        <div className="stat-widget">
          <div className="stat-value" style={{ color: '#22c55e' }}>{deepCount}</div>
          <div className="stat-label">Deep</div>
        </div>
        <div className="stat-widget">
          <div className="stat-value" style={{ color: '#eab308' }}>{surfaceCount}</div>
          <div className="stat-label">Surface</div>
        </div>
        <div className="stat-widget">
          <div className="stat-value" style={{ color: '#22c55e' }}>{Math.round(deepCount / concepts.length * 100)}%</div>
          <div className="stat-label">Deep Rate</div>
        </div>
      </div>

      <div className="card">
        <input
          className="search-input"
          placeholder="개념 검색... (예: CAS, ThreadLocal, Semaphore)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="filter-bar" style={{ marginTop: 12 }}>
          {['ALL', 'DEEP', 'SURFACE'].map(f => (
            <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f} {f === 'ALL' ? `(${concepts.length})` : f === 'DEEP' ? `(${deepCount})` : `(${surfaceCount})`}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
          {filtered.length}개 개념 표시 중
        </div>

        {days.map(day => {
          const dayConcepts = filtered.filter(c => c.day === day)
          if (dayConcepts.length === 0) return null
          return (
            <div key={day} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--accent-light)',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                marginBottom: 8,
              }}>
                {day}
              </div>
              {dayConcepts.map((c, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 6,
                  transition: 'background 0.2s',
                  cursor: 'default',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(51,65,85,0.3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 14 }}>{c.name}</span>
                  <Badge status={c.status} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
