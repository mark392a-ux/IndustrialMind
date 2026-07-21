import { Sun, Moon, Bell, RefreshCw } from 'lucide-react'
import { useStore, type Tab } from '../../../store'
import type { GraphStats } from '../../types'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'copilot', icon: '💬', label: 'Copilot' },
  { id: 'rca', icon: '🔬', label: 'RCA Agent' },
  { id: 'compliance', icon: '🛡️', label: 'Compliance' },
  { id: 'permit', icon: '📄', label: 'Work Permit' },
  { id: 'graph', icon: '🧠', label: 'Knowledge Graph' },
]

export default function Header({ 
  graphStats, 
  onRefreshStats 
}: { 
  graphStats: GraphStats | null 
  onRefreshStats: () => Promise<void>   // Make it async
}) {
  const { documents, activeTab, setActiveTab, theme, toggleTheme } = useStore()
  
  const indexed = documents.filter(d => d.status === 'indexed').length
  const nodes = graphStats?.total_nodes ?? 0
  const edges = graphStats?.total_edges ?? 0

  const [coverageLabel, coverageColor] =
    indexed === 0 ? ['No Data', 'var(--text3)'] :
    indexed < 5 ? ['Low', 'var(--danger)'] :
    indexed < 20 ? ['Medium', 'var(--warning)'] : ['Good', 'var(--success)']

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  const STATS = [
    { v: documents.length, label: 'Documents', sub: 'Total uploaded', accent: false },
    { v: indexed, label: 'Indexed', sub: 'Successfully indexed', accent: true },
    { v: nodes, label: 'Knowledge Nodes', sub: 'In knowledge graph', accent: false },
    { v: edges, label: 'Relationships', sub: 'Total connections', accent: false },
  ]

  return (
    <header style={{ flexShrink: 0, background: 'var(--sidebar)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)', lineHeight: 1.2 }}>
            Welcome to IndustrialMind 👋
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 3 }}>
            How can I assist with your plant operations today?
          </p>
        </div>

        {/* KPI Stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          {STATS.map(({ v, label, sub, accent }) => (
            <div key={label} style={{
              padding: '11px 16px', borderRadius: 16, minWidth: 105, textAlign: 'center',
              background: accent ? 'var(--violet-deep)' : 'var(--card)',
              border: accent ? '1px solid var(--violet-border)' : '1px solid var(--border)',
              boxShadow: accent ? '0 6px 20px var(--violet-glow)' : '0 2px 10px rgba(0,0,0,0.1)',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: accent ? '#fff' : 'var(--text1)', lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: accent ? '#fff' : 'var(--text1)', marginTop: 4 }}>{label}</div>
              <div style={{ fontSize: 10, color: accent ? 'rgba(255,255,255,0.7)' : 'var(--text3)', marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button 
            onClick={onRefreshStats} 
            title="Refresh Stats" 
            style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border2)',
              background: 'var(--card)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <RefreshCw size={16} />
          </button>

          <button onClick={toggleTheme} style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border2)',
            background: 'var(--card)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button style={{
            width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border2)',
            background: 'var(--card)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bell size={16} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', gap: 2 }}>
        {TABS.map(({ id, icon, label }) => {
          const active = activeTab === id
          return (
            <button 
              key={id} 
              onClick={() => setActiveTab(id)} 
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 16px', fontSize: 13, fontWeight: active ? 700 : 500,
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${active ? 'var(--violet)' : 'transparent'}`,
                color: active ? 'var(--violet)' : 'var(--text3)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 14 }}>{icon}</span>
              {label}
            </button>
          )
        })}
      </div>
    </header>
  )
}