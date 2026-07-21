import { Loader2 } from 'lucide-react'
import React from 'react'

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="anim-spin" style={{ color: 'var(--violet)' }} />
}

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}
export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className = '', style, ...props }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none'
  const variants: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--grad-rust)', color: '#fff', boxShadow: '0 4px 20px var(--rust-glow)' },
    secondary: { background: 'var(--card2)', color: 'var(--text1)', border: '1px solid var(--border2)' },
    ghost:     { background: 'transparent', color: 'var(--text2)' },
    danger:    { background: 'var(--rust-dim)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.2)' },
  }
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-sm px-5 py-2.5' }
  return (
    <button className={`${base} ${sizes[size]} ${className}`}
      style={{ ...variants[variant], fontFamily: 'var(--font)', ...style }}
      disabled={loading || props.disabled}
      onMouseEnter={e => { if (variant === 'primary') (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none' }}
      {...props}>
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  )
}

export function Card({ children, className = '', glow, style }: {
  children: React.ReactNode; className?: string;
  glow?: 'violet' | 'rust' | false; style?: React.CSSProperties
}) {
  const glowShadow = glow === 'violet' ? '0 0 32px var(--violet-glow)' : glow === 'rust' ? '0 0 32px var(--rust-dim)' : undefined
  return (
    <div className={`rounded-2xl ${className}`} style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      boxShadow: glowShadow ?? '0 4px 20px rgba(0,0,0,0.15)', ...style,
    }}>
      {children}
    </div>
  )
}

export function Input({ label, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.01em' }}>{label}</label>}
      <input className={`w-full outline-none transition-all ${className}`}
        style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text1)', borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--violet)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--violet-dim)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.boxShadow = 'none' }}
        {...props} />
    </div>
  )
}

export function Select({ label, options, className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.01em' }}>{label}</label>}
      <select className={`w-full outline-none transition-all ${className}`}
        style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text1)', borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', cursor: 'pointer' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--violet)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--violet-dim)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.boxShadow = 'none' }}
        {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export function Textarea({ label, className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {label && <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', letterSpacing: '0.01em' }}>{label}</label>}
      <textarea className={`w-full outline-none transition-all resize-none ${className}`}
        style={{ background: 'var(--bg)', border: '1px solid var(--border2)', color: 'var(--text1)', borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.65, fontFamily: 'inherit' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--violet)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--violet-dim)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.boxShadow = 'none' }}
        {...props} />
    </div>
  )
}

export function Spinner2({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="anim-spin" style={{ color: 'var(--violet)' }} />
}

export function EmptyState({ icon, title, subtitle, steps }: {
  icon: string; title: string; subtitle?: string; steps?: string[]
}) {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 56, filter: 'drop-shadow(0 0 16px var(--violet-glow))' }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text1)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 14, color: 'var(--text3)', maxWidth: 340, lineHeight: 1.6 }}>{subtitle}</div>}
      {steps && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ fontSize: 13, padding: '10px 20px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text2)' }}>{s}</div>
              {i < steps.length - 1 && <div style={{ color: 'var(--text3)', fontSize: 18, fontWeight: 300 }}>↓</div>}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/* Source chips with confidence % badge */
export function SourceChips({ sources = [] }: { sources: Array<{ filename: string; page: number; score?: number }> }) {
  if (!sources.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
      {sources.slice(0, 5).map((s, i) => (
        <div key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 8,
          background: 'var(--violet-dim)', border: '1px solid var(--violet-border)',
        }}>
          <span style={{ fontSize: 11 }}>📄</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--violet)' }}>
            {s.filename.length > 22 ? s.filename.slice(0, 20) + '…' : s.filename} · p.{s.page}
          </span>
          {s.score != null && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
              background: s.score > 0.9 ? 'var(--rust-dim)' : 'var(--sweetie-dim)',
              color: s.score > 0.9 ? 'var(--rust)' : 'var(--sweetie)',
              border: `1px solid ${s.score > 0.9 ? 'var(--rust-border)' : 'rgba(225,183,221,0.3)'}`,
            }}>
              {Math.round(s.score * 100)}%
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export function AgentBadge({ agent }: { agent: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    copilot:    { label: 'Copilot',    bg: 'var(--violet-dim)',  color: 'var(--violet)' },
    rca:        { label: 'RCA Agent',  bg: 'var(--rust-dim)',    color: 'var(--rust)' },
    compliance: { label: 'Compliance', bg: 'rgba(52,211,153,0.1)', color: 'var(--success)' },
  }
  const { label, bg, color } = map[agent] ?? map.copilot
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: bg, color, border: `1px solid ${color}33` }}>
      🤖 {label}
    </span>
  )
}

export function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 2px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} className="anim-bounce" style={{
          width: 6, height: 6, borderRadius: '50%', background: 'var(--violet)', display: 'inline-block',
          animationDelay: `${i * 0.15}s`,
        }} />
      ))}
    </div>
  )
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 14, color: 'var(--text3)', marginTop: 5, lineHeight: 1.5 }}>{subtitle}</p>}
    </div>
  )
}

export function Badge({ children, variant = 'muted' }: { children: React.ReactNode; variant?: 'violet'|'rust'|'green'|'red'|'muted' }) {
  const s = {
    violet: { bg: 'var(--violet-dim)', color: 'var(--violet)',   border: 'var(--violet-border)' },
    rust:   { bg: 'var(--rust-dim)',   color: 'var(--rust)',     border: 'var(--rust-border)' },
    green:  { bg: 'rgba(52,211,153,0.1)', color: '#34D399',     border: 'rgba(52,211,153,0.3)' },
    red:    { bg: 'rgba(248,113,113,0.1)', color: '#F87171',    border: 'rgba(248,113,113,0.3)' },
    muted:  { bg: 'var(--card2)',      color: 'var(--text2)',    border: 'var(--border)' },
  }[variant]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {children}
    </span>
  )
}

export function KPICard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 18, textAlign: 'center',
      background: accent ? 'var(--violet-deep)' : 'var(--card)',
      border: accent ? 'none' : '1px solid var(--border)',
      boxShadow: accent ? '0 8px 28px var(--violet-glow)' : '0 4px 16px rgba(0,0,0,0.1)',
      transition: 'transform 0.15s', cursor: 'default',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ? '#fff' : 'var(--text1)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent ? 'rgba(255,255,255,0.95)' : 'var(--text1)', marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: accent ? 'rgba(255,255,255,0.6)' : 'var(--text3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}
