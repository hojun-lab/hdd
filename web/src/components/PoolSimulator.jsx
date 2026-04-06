import { useState, useRef, useCallback } from 'react'

const createPool = (size) => Array.from({ length: size }, (_, i) => ({ id: i + 1, state: 'idle' }))

export default function PoolSimulator() {
  const [poolSize, setPoolSize] = useState(10)
  const [pool, setPool] = useState(() => createPool(10))
  const [pending, setPending] = useState([])
  const [logs, setLogs] = useState([])
  const [speed, setSpeed] = useState(500)
  const nextPendingId = useRef(1)

  const addLog = useCallback((msg) => {
    setLogs(prev => [{ id: Date.now(), msg, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 20))
  }, [])

  const getConnection = useCallback(() => {
    setPool(prev => {
      const idx = prev.findIndex(c => c.state === 'idle')
      if (idx === -1) {
        const pid = nextPendingId.current++
        setPending(p => [...p, pid])
        addLog(`⏳ 대기 중 (pending #${pid}) — 풀에 여유 커넥션 없음`)
        return prev
      }
      const next = [...prev]
      next[idx] = { ...next[idx], state: 'active' }
      addLog(`✅ 커넥션 #${next[idx].id} 획득 (active)`)
      return next
    })
  }, [addLog])

  const releaseConnection = useCallback(() => {
    setPool(prev => {
      const idx = prev.findIndex(c => c.state === 'active')
      if (idx === -1) {
        addLog('⚠️ 반환할 active 커넥션이 없음')
        return prev
      }
      const next = [...prev]
      next[idx] = { ...next[idx], state: 'idle' }
      addLog(`🔄 커넥션 #${next[idx].id} 반환 (idle)`)

      setPending(p => {
        if (p.length > 0) {
          const [first, ...rest] = p
          addLog(`🔔 pending #${first} → 커넥션 #${next[idx].id} 핸드오프`)
          next[idx] = { ...next[idx], state: 'active' }
          return rest
        }
        return p
      })

      return next
    })
  }, [addLog])

  const leak = useCallback(() => {
    setPool(prev => {
      const idx = prev.findIndex(c => c.state === 'idle')
      if (idx === -1) {
        addLog('💀 누수 실패 — 이미 풀이 비어있음')
        return prev
      }
      const next = [...prev]
      next[idx] = { ...next[idx], state: 'active' }
      addLog(`🚨 커넥션 #${next[idx].id} 누수! (release 안 됨)`)
      return next
    })
  }, [addLog])

  const flood = useCallback(() => {
    addLog('🌊 Flood 시작: 50개 요청')
    let count = 0
    const interval = setInterval(() => {
      if (count >= 50) {
        clearInterval(interval)
        return
      }
      getConnection()
      setTimeout(() => releaseConnection(), speed + Math.random() * speed)
      count++
    }, 30)
  }, [getConnection, releaseConnection, speed])

  const resetPool = useCallback(() => {
    setPool(createPool(poolSize))
    setPending([])
    setLogs([])
    addLog(`🔄 풀 리셋 (size=${poolSize})`)
  }, [poolSize, addLog])

  const handlePoolSizeChange = (newSize) => {
    setPoolSize(newSize)
    setPool(createPool(newSize))
    setPending([])
    addLog(`📐 풀 사이즈 변경: ${newSize}`)
  }

  const activeCount = pool.filter(c => c.state === 'active').length
  const idleCount = pool.filter(c => c.state === 'idle').length

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-widget">
          <div className="stat-value" style={{ color: '#22c55e' }}>{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-widget">
          <div className="stat-value" style={{ color: '#3b82f6' }}>{idleCount}</div>
          <div className="stat-label">Idle</div>
        </div>
        <div className="stat-widget">
          <div className="stat-value" style={{ color: '#f97316' }}>{pending.length}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-widget">
          <div className="stat-value">{pool.length}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Connection Pool</div>
          <div className="pool-grid">
            {pool.map(conn => (
              <div key={conn.id} className={`pool-conn ${conn.state}`}>
                #{conn.id}
              </div>
            ))}
          </div>

          {pending.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>
                Pending Queue ({pending.length})
              </div>
              <div className="pending-queue">
                {pending.map(p => <div key={p} className="pending-dot" title={`pending #${p}`} />)}
              </div>
            </div>
          )}

          <div className="controls" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={getConnection}>getConnection()</button>
            <button className="btn" onClick={releaseConnection}>release()</button>
            <button className="btn btn-danger" onClick={leak}>Leak!</button>
            <button className="btn" onClick={flood} style={{ borderColor: '#f97316', color: '#f97316' }}>Flood (50)</button>
            <button className="btn" onClick={resetPool}>Reset</button>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 24, fontSize: 13, color: 'var(--text-dim)' }}>
            <label>
              Pool Size: {poolSize}
              <input type="range" min="1" max="20" value={poolSize} onChange={e => handlePoolSizeChange(Number(e.target.value))}
                style={{ marginLeft: 8, verticalAlign: 'middle' }} />
            </label>
            <label>
              Speed: {speed}ms
              <input type="range" min="100" max="2000" step="100" value={speed} onChange={e => setSpeed(Number(e.target.value))}
                style={{ marginLeft: 8, verticalAlign: 'middle' }} />
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Event Log</div>
          <div style={{ maxHeight: 400, overflowY: 'auto', fontSize: 13 }}>
            {logs.length === 0 && <div style={{ color: 'var(--text-dim)', padding: 16 }}>버튼을 눌러서 풀을 조작해보세요</div>}
            {logs.map(log => (
              <div key={log.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>{log.time}</span>
                {log.msg}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="callout" style={{ marginTop: 16 }}>
        <strong>사용법:</strong> getConnection()으로 커넥션을 빌려가고, release()로 반환합니다.
        Leak! 버튼은 반환하지 않는 누수를 시뮬레이션합니다.
        Flood는 50개 요청을 빠르게 보내 풀 고갈을 관찰합니다.
        pending이 쌓이는 것을 관찰하세요 — 이것이 프로덕션에서의 풀 고갈 신호입니다.
      </div>
    </div>
  )
}
