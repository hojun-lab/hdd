const weeks = [
  {
    title: 'Week 1: Foundations',
    subtitle: 'Build: NaivePool (v0 → v1)',
    days: [
      { day: 'D1', topic: 'TCP/IP cost of DB connections', theory: 'DEEP', build: 'COMPLETE', date: '03-24', note: 'avg=22ms, p99=100ms' },
      { day: 'D2', topic: 'JDBC driver internals', theory: 'DEEP', build: 'COMPLETE', date: '03-24', note: 'v0: 349 req/sec' },
      { day: 'D3', topic: 'Connection pool lifecycle', theory: 'DEEP', build: 'COMPLETE', date: '03-25', note: 'v1: 4769 req/sec (13.6x)' },
      { day: 'D4', topic: 'HikariCP vs alternatives', theory: 'DEEP', build: 'COMPLETE', date: '03-26', note: 'ThreadLocal+CAS 학습' },
      { day: 'D5', topic: 'HikariCP architecture', theory: 'DEEP', build: 'COMPLETE', date: '03-27', note: 'v2 설계 문서 완성' },
      { day: 'Mission', topic: 'Lifecycle diagram + Benchmark report', theory: 'PENDING', build: 'PENDING', date: '-', note: '' },
    ]
  },
  {
    title: 'Week 2: Internals & Tuning',
    subtitle: 'Build: OptimizedPool (v2 → v3)',
    days: [
      { day: 'D1', topic: 'ConcurrentBag deep-dive', theory: 'DEEP', build: 'COMPLETE', date: '03-30', note: 'CAS 5% 향상, 실패율 동일' },
      { day: 'D2', topic: 'Connection acquisition flow', theory: 'DEEP', build: 'COMPLETE', date: '03-31', note: 'Semaphore: 69%→0%' },
      { day: 'D3', topic: 'Core config parameters', theory: 'DEEP', build: 'COMPLETE', date: '04-01', note: 'core×2 공식' },
      { day: 'D4', topic: 'Leak detection & validation', theory: 'DEEP', build: 'COMPLETE', date: '04-01', note: 'Throwable 캡처' },
      { day: 'D5', topic: 'Metrics & monitoring', theory: 'DEEP', build: 'COMPLETE', date: '04-03', note: 'active/idle/pending/total' },
      { day: 'Mission', topic: 'Config defense + Benchmark report', theory: 'PENDING', build: 'PENDING', date: '-', note: '' },
    ]
  },
  {
    title: 'Week 3: Production Mastery',
    subtitle: 'Build: BreakIt (v4 → Final)',
    days: [
      { day: 'D1', topic: 'Connection exhaustion', theory: 'NOT_STARTED', build: 'NOT_STARTED', date: '-', note: '' },
      { day: 'D2', topic: 'Deadlock & pool starvation', theory: 'NOT_STARTED', build: 'NOT_STARTED', date: '-', note: '' },
      { day: 'D3', topic: 'maxLifetime vs infra timeout', theory: 'NOT_STARTED', build: 'NOT_STARTED', date: '-', note: '' },
      { day: 'D4', topic: 'Multi-datasource routing', theory: 'NOT_STARTED', build: 'NOT_STARTED', date: '-', note: '' },
      { day: 'D5', topic: 'Performance tuning', theory: 'NOT_STARTED', build: 'NOT_STARTED', date: '-', note: '' },
      { day: 'Mission', topic: 'Incident diagnosis + Retrospective', theory: 'NOT_STARTED', build: 'NOT_STARTED', date: '-', note: '' },
    ]
  }
]

const buildVersions = [
  { version: 'v0', desc: 'No pool (baseline)', status: 'COMPLETE', result: '349 req/sec' },
  { version: 'v1', desc: 'ArrayList + synchronized', status: 'COMPLETE', result: '4,769 req/sec' },
  { version: 'v2', desc: 'ThreadLocal + CAS + Semaphore', status: 'COMPLETE', result: '3,602 req/sec (0% fail)' },
  { version: 'v3', desc: '+ timeout + leak detection + metrics', status: 'COMPLETE', result: 'Full featured' },
  { version: 'v4', desc: '+ maxLifetime + validation', status: 'NOT_STARTED', result: '-' },
  { version: 'Final', desc: 'vs HikariCP benchmark', status: 'NOT_STARTED', result: '-' },
]

const Badge = ({ status }) => {
  const cls = {
    'DEEP': 'badge-deep',
    'SURFACE': 'badge-surface',
    'NOT_STARTED': 'badge-not-started',
    'PENDING': 'badge-pending',
    'COMPLETE': 'badge-complete',
    'IN-PROGRESS': 'badge-in-progress',
  }
  return <span className={`badge ${cls[status] || 'badge-not-started'}`}>{status}</span>
}

export default function ProgressView() {
  return (
    <div>
      <div className="grid-3">
        {weeks.map((week, wi) => (
          <div className="card" key={wi}>
            <div className="card-title">{week.title}</div>
            <div className="card-desc">{week.subtitle}</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Topic</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {week.days.map((d, di) => (
                  <tr key={di}>
                    <td style={{ fontWeight: 600, color: 'var(--accent-light)', whiteSpace: 'nowrap' }}>{d.day}</td>
                    <td>
                      <div>{d.topic}</div>
                      {d.note && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{d.note}</div>}
                    </td>
                    <td><Badge status={d.theory} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">Build Versions</div>
        <div className="card-desc">MiniPool 진화 과정</div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '8px 0' }}>
          {buildVersions.map((bv, i) => (
            <div key={i} style={{
              minWidth: 180,
              padding: 16,
              background: bv.status === 'COMPLETE' ? 'rgba(34,197,94,0.05)' : 'var(--bg)',
              border: `1px solid ${bv.status === 'COMPLETE' ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
              borderRadius: 10,
              position: 'relative',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: bv.status === 'COMPLETE' ? 'var(--success)' : 'var(--text-dim)' }}>{bv.version}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4 }}>{bv.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>{bv.result}</div>
              <div style={{ marginTop: 8 }}><Badge status={bv.status} /></div>
              {i < buildVersions.length - 1 && (
                <div style={{ position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: 18 }}>→</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
