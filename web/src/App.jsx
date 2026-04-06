import { useState } from 'react'
import './index.css'
import ProgressView from './components/ProgressView'
import BenchmarkView from './components/BenchmarkView'
import LifecycleView from './components/LifecycleView'
import PoolSimulator from './components/PoolSimulator'
import ConceptView from './components/ConceptView'

const TABS = [
  { id: 'progress', label: 'Progress' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'simulator', label: 'Pool Simulator' },
  { id: 'concepts', label: 'Concepts' },
]

const completedDays = 10
const totalDays = 15

function App() {
  const [activeTab, setActiveTab] = useState('progress')

  const renderTab = () => {
    switch (activeTab) {
      case 'progress': return <ProgressView />
      case 'benchmarks': return <BenchmarkView />
      case 'lifecycle': return <LifecycleView />
      case 'simulator': return <PoolSimulator />
      case 'concepts': return <ConceptView />
      default: return <ProgressView />
    }
  }

  return (
    <>
      <div className="dashboard-header">
        <h1>HikariCP Deep-Dive Dashboard</h1>
        <p className="subtitle">3-Week Connection Pool Internals Mentoring Program</p>
        <div className="header-stats">
          <div className="header-stat">
            Week <span className="value">2</span> / 3
          </div>
          <div className="header-stat">
            Day <span className="value">5</span> / 5
          </div>
          <div className="header-stat">
            Completed <span className="value">{completedDays}</span> / {totalDays} days
          </div>
          <div className="header-stat">
            Build Version <span className="value">v3</span>
          </div>
        </div>
        <div className="progress-bar-outer">
          <div
            className="progress-bar-inner"
            style={{ width: `${(completedDays / totalDays) * 100}%` }}
          />
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {renderTab()}
      </div>
    </>
  )
}

export default App
