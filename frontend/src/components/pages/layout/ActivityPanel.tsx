import { useStore } from '../../../store'
import { Spinner } from '../../ui'

const ICON_MAP: Record<string, string> = {
  search: '🔎', retrieve: '📚', graph: '🕸️',
  reason: '🧠', generate: '✍️', done: '✓',
}

export default function ActivityPanel() {
  const { activities, clearActivities, topSources } = useStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>⚡</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            AI Activity
          </span>
        </div>
        {activities.length > 0 && (
          <button onClick={clearActivities} style={{
            fontSize: 11, color: 'var(--text3)', background: 'none',
            border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text1)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>
            Clear
          </button>
        )}
      </div>

      {/* Activity log */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {activities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 8px' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              AI activity will appear here when you use the copilot or run analysis
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {activities.map((item, idx) => (
              <div key={item.id} className="anim-activity" style={{
                display: 'flex', gap: 8, padding: '8px 10px',
                borderRadius: 10,
                background: idx === 0 ? 'var(--violet-dim)' : 'var(--card)',
                border: `1px solid ${idx === 0 ? 'var(--violet-border)' : 'var(--border)'}`,
                animationDelay: `${idx * 0.04}s`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                  background: idx === 0 ? 'var(--violet-deep)' : 'var(--card2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                }}>
                  {idx === 0 ? <Spinner size={11} /> : (ICON_MAP[item.icon] ?? '●')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: idx === 0 ? 'var(--violet)' : 'var(--text1)', lineHeight: 1.3 }}>
                    {item.text}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{item.sub}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{item.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top sources */}
      {topSources.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text1)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Top Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {topSources.slice(0, 4).map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: 'var(--rust-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                }}>📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.filename}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>Page {s.page}</div>
                </div>
                {/* Confidence badge */}
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                  background: s.score > 0.9 ? 'var(--rust-dim)' : 'var(--violet-dim)',
                  color: s.score > 0.9 ? 'var(--rust)' : 'var(--violet)',
                  border: `1px solid ${s.score > 0.9 ? 'var(--rust-border)' : 'var(--violet-border)'}`,
                  flexShrink: 0,
                }}>
                  {Math.round(s.score * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
