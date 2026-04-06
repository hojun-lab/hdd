import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

const poolIntroData = [
  { name: 'v0 (No Pool)', throughput: 400, fill: '#ef4444' },
  { name: 'v1 (MiniPool)', throughput: 3651, fill: '#22c55e' },
]

const poolSizeData = [
  { name: 'pool=5', throughput: 2552 },
  { name: 'pool=10', throughput: 8124 },
  { name: 'pool=20', throughput: 5993 },
  { name: 'pool=50', throughput: 7230 },
]

const syncCompareData = [
  { name: 'Throughput (req/sec)', v1: 6714, v2: 7044 },
  { name: 'Failures', v1: 34382, v2: 34392 },
]

const waitMechanismData = [
  { name: 'No wait', throughput: 7044, failRate: 69 },
  { name: 'Semaphore 30s', throughput: 3602, failRate: 0 },
  { name: 'Semaphore 100ms', throughput: 3195, failRate: 7 },
]

const connCostData = [
  { name: 'AVG', ms: 22 },
  { name: 'p50', ms: 17 },
  { name: 'p99', ms: 100 },
  { name: 'MAX', ms: 358 },
]

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '10px 14px' }}>
        <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>{label}</p>
        {payload.map((p, i) => (
          <p key={i} style={{ color: p.color, fontSize: 13 }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

const ChartCard = ({ title, desc, children, insight }) => (
  <div className="card">
    <div className="card-title">{title}</div>
    <div className="card-desc">{desc}</div>
    {children}
    {insight && <div className="callout">{insight}</div>}
  </div>
)

export default function BenchmarkView() {
  return (
    <div className="grid-2">
      <ChartCard
        title="v0 vs v1 — 풀 도입 효과"
        desc="50 threads, 100 iterations"
        insight="풀 도입만으로 ~9배 성능 향상. 커넥션 재사용이 핵심."
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={poolIntroData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="throughput" name="Throughput (req/sec)" radius={[4, 4, 0, 0]}>
              {poolIntroData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="풀 사이즈별 처리량"
        desc="50 threads, 1000 iterations, Semaphore 30s"
        insight="pool=10이 최적. connections = core_count × 2 공식."
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={poolSizeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="throughput" name="Throughput (req/sec)" fill="#3b82f6" radius={[4, 4, 0, 0]}>
              {poolSizeData.map((entry, i) => (
                <Cell key={i} fill={entry.throughput === 8124 ? '#22c55e' : '#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="동기화 방식 비교 — v1 vs v2"
        desc="50 threads, 1000 iterations, pool=10, no wait"
        insight="synchronized → CAS: 처리량 5% 향상, 실패율 동일. 동기화 방식이 병목이 아님."
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={syncCompareData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="v1" name="v1 (synchronized)" fill="#f97316" radius={[4, 4, 0, 0]} />
            <Bar dataKey="v2" name="v2 (CAS)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="대기 메커니즘 효과"
        desc="실패율 변화에 주목"
        insight="Semaphore 추가로 실패율 69% → 0%. 대기 메커니즘이 진짜 해결책."
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={waitMechanismData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} />
            <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={12} unit="%" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar yAxisId="left" dataKey="throughput" name="Throughput" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="failRate" name="Fail Rate (%)" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="커넥션 생성 비용 분포"
        desc="Docker MySQL localhost, 1000회 측정"
        insight="커넥션 1개 = 22ms. p99는 100ms. 풀 없이는 매 요청이 이 비용을 지불."
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={connCostData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} unit="ms" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="ms" name="Latency (ms)" fill="#eab308" radius={[4, 4, 0, 0]}>
              {connCostData.map((entry, i) => (
                <Cell key={i} fill={entry.ms > 50 ? '#ef4444' : '#eab308'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="성능 개선 요약"
        desc="전체 학습 과정에서의 성능 변화"
        insight="진짜 병목을 먼저 해결하라. synchronized→CAS는 5%, 대기 메커니즘은 69%→0%."
      >
        <table className="data-table">
          <thead>
            <tr>
              <th>버전</th>
              <th>주요 변경</th>
              <th>처리량</th>
              <th>실패율</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, color: '#ef4444' }}>v0</td>
              <td>풀 없음</td>
              <td>400/sec</td>
              <td>-</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#f97316' }}>v1</td>
              <td>ArrayList + synchronized</td>
              <td>6,714/sec</td>
              <td>69%</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#3b82f6' }}>v2 (CAS)</td>
              <td>ThreadLocal + CAS</td>
              <td>7,044/sec</td>
              <td>69%</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: '#22c55e' }}>v2 + Semaphore</td>
              <td>+ 대기 메커니즘</td>
              <td>3,602/sec</td>
              <td style={{ color: '#22c55e', fontWeight: 700 }}>0%</td>
            </tr>
          </tbody>
        </table>
      </ChartCard>
    </div>
  )
}
