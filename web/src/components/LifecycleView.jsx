import { useState } from 'react'

const states = [
  { id: 'created', label: 'Created', color: '#64748b', x: 50, y: 150 },
  { id: 'idle', label: 'Idle', color: '#3b82f6', x: 250, y: 150 },
  { id: 'inuse', label: 'In Use', color: '#22c55e', x: 450, y: 150 },
  { id: 'removed', label: 'Removed', color: '#ef4444', x: 350, y: 300 },
]

const transitions = [
  { from: 'created', to: 'idle', label: '풀 초기화 시 생성', path: 'M120,160 L180,160' },
  { from: 'idle', to: 'inuse', label: 'getConnection()', path: 'M320,140 L380,140' },
  { from: 'inuse', to: 'idle', label: 'release()', path: 'M380,175 L320,175' },
  { from: 'inuse', to: 'removed', label: 'isValid() 실패', path: 'M460,210 L410,260' },
  { from: 'idle', to: 'removed', label: 'maxLifetime 초과', path: 'M280,210 L320,260' },
]

const fallbackSteps = [
  { id: 1, label: '① ThreadLocal 확인', desc: '마지막에 쓴 커넥션이 가용한가? 락 없이 O(1)' },
  { id: 2, label: '② 공유 풀(CAS) 탐색', desc: 'sharedList 순회, compareAndSet(0,1)로 획득' },
  { id: 3, label: '③ Semaphore 대기', desc: 'connectionTimeout까지 대기, 반환되면 받기' },
  { id: 4, label: '④ 타임아웃 예외', desc: 'ConnectionTimeout! 획득 실패' },
]

const lifecycleSteps = [
  { state: 'created', transition: null, desc: '커넥션이 생성되었습니다 (DriverManager.getConnection)' },
  { state: 'idle', transition: '풀 초기화', desc: '풀에 보관됩니다. 요청을 기다리는 중...' },
  { state: 'inuse', transition: 'getConnection()', desc: '스레드가 커넥션을 빌려갔습니다. 쿼리 실행 중...' },
  { state: 'idle', transition: 'release()', desc: '사용 완료. 풀에 반환되어 다음 요청을 기다립니다.' },
  { state: 'inuse', transition: 'getConnection()', desc: '다른 스레드가 다시 빌려갑니다.' },
  { state: 'removed', transition: 'isValid() 실패', desc: 'DB 연결이 끊어졌습니다. 폐기됩니다.' },
]

export default function LifecycleView() {
  const [activeState, setActiveState] = useState(null)
  const [activeFallback, setActiveFallback] = useState(null)
  const [stepIndex, setStepIndex] = useState(-1)
  const currentStep = stepIndex >= 0 ? lifecycleSteps[stepIndex] : null

  return (
    <div>
      <div className="card">
        <div className="card-title">Connection Lifecycle State Diagram</div>
        <div className="card-desc">커넥션이 풀 안에서 거치는 상태 변화</div>

        <div className="controls">
          <button className="btn btn-primary" onClick={() => setStepIndex(prev => prev < lifecycleSteps.length - 1 ? prev + 1 : 0)}>
            {stepIndex < 0 ? '▶ 시작' : '다음 단계 →'}
          </button>
          <button className="btn" onClick={() => setStepIndex(-1)}>
            리셋
          </button>
          {currentStep && (
            <span style={{ padding: '8px 16px', color: 'var(--accent-light)', fontSize: 14 }}>
              Step {stepIndex + 1}/{lifecycleSteps.length}: {currentStep.transition || 'Initial'} — {currentStep.desc}
            </span>
          )}
        </div>

        <svg viewBox="0 0 560 380" style={{ width: '100%', maxWidth: 700, margin: '0 auto', display: 'block' }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Arrows */}
          {/* Created → Idle */}
          <line x1="120" y1="155" x2="180" y2="155" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x="150" y="142" fill="#94a3b8" fontSize="10" textAnchor="middle">풀 초기화</text>

          {/* Idle → InUse */}
          <line x1="320" y1="140" x2="380" y2="140" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x="350" y="128" fill="#3b82f6" fontSize="10" textAnchor="middle">getConnection()</text>

          {/* InUse → Idle */}
          <line x1="380" y1="175" x2="320" y2="175" stroke="#22c55e" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x="350" y="195" fill="#22c55e" fontSize="10" textAnchor="middle">release()</text>

          {/* InUse → Removed */}
          <line x1="465" y1="210" x2="415" y2="265" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x="460" y="245" fill="#ef4444" fontSize="10" textAnchor="start">isValid() 실패</text>

          {/* Idle → Removed */}
          <line x1="265" y1="210" x2="325" y2="265" stroke="#f97316" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x="260" y="248" fill="#f97316" fontSize="10" textAnchor="end">maxLifetime 초과</text>

          {/* State circles */}
          {states.map(s => {
            const isActive = currentStep?.state === s.id || activeState === s.id
            return (
              <g key={s.id}
                onMouseEnter={() => setActiveState(s.id)}
                onMouseLeave={() => setActiveState(null)}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={s.x} y={s.y - 30} width={120} height={60} rx={12}
                  fill={isActive ? s.color + '33' : '#1e293b'}
                  stroke={isActive ? s.color : '#334155'}
                  strokeWidth={isActive ? 3 : 1.5}
                />
                <text x={s.x + 60} y={s.y + 7} fill={s.color} fontSize="14" fontWeight="600" textAnchor="middle">
                  {s.label}
                </text>
              </g>
            )
          })}

          {/* Start/End markers */}
          <circle cx="30" cy="155" r="8" fill="#64748b" />
          <text x="30" y="132" fill="#94a3b8" fontSize="10" textAnchor="middle">[*]</text>

          <circle cx="350" cy="350" r="8" fill="none" stroke="#ef4444" strokeWidth="2" />
          <circle cx="350" cy="350" r="4" fill="#ef4444" />
          <line x1="365" y1="320" x2="355" y2="340" stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#arrow)" />
        </svg>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">getConnection() 4-Step Fallback Flow</div>
        <div className="card-desc">빠른 경로부터 시도하고, 실패할수록 비싼 경로로 내려간다</div>

        <div className="lifecycle-flow">
          {fallbackSteps.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                className={`lifecycle-step ${activeFallback === step.id ? 'active' : ''}`}
                onClick={() => setActiveFallback(activeFallback === step.id ? null : step.id)}
                style={{
                  borderColor: step.id === 4 ? '#ef4444' : undefined,
                  color: step.id === 4 ? '#ef4444' : undefined,
                }}
              >
                {step.label}
              </div>
              {i < fallbackSteps.length - 1 && <span className="lifecycle-arrow">→</span>}
            </div>
          ))}
        </div>

        {activeFallback && (
          <div className="callout" style={{ marginTop: 8 }}>
            {fallbackSteps.find(s => s.id === activeFallback)?.desc}
          </div>
        )}
      </div>
    </div>
  )
}
