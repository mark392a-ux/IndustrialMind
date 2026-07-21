import { useRef, useState } from 'react'
import {
  MessageSquare, Microscope, ClipboardCheck, FileText,
  Network, Files, Calculator, X, Trash2,
  CheckCircle2, Clock, AlertCircle, ChevronRight,
} from 'lucide-react'
import { useStore, type Tab } from '../../../store'
import { deleteDocument } from '../../../api/client'
import { Spinner } from '../../ui'
import type { Document } from '../../types'

const NAV: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: 'copilot',    icon: <MessageSquare  size={16} />, label: 'Copilot' },
  { id: 'rca',        icon: <Microscope     size={16} />, label: 'RCA Agent' },
  { id: 'compliance', icon: <ClipboardCheck size={16} />, label: 'Compliance' },
  { id: 'permit',     icon: <FileText       size={16} />, label: 'Work Permit' },
  { id: 'graph',      icon: <Network        size={16} />, label: 'Knowledge Graph' },
  { id: 'documents',  icon: <Files          size={16} />, label: 'Documents' },
  { id: 'roi',        icon: <Calculator     size={16} />, label: 'ROI Calculator' },
]

const PRESETS = [
  { icon: <Microscope size={14} />,     label: 'Pump Failure RCA',       tab: 'rca'        as Tab, data: { equipmentId: 'P-101A', symptom: 'Excessive vibration and bearing temperature alarm at 85°C before trip.' } },
  { icon: <ClipboardCheck size={14} />, label: 'OISD Compliance Audit',  tab: 'compliance' as Tab, data: { standard: 'OISD-105' } },
  { icon: <MessageSquare size={14} />,  label: 'New Engineer Onboarding', tab: 'copilot'   as Tab, data: { query: 'What are the key safety procedures before entering the process area?' } },
]

const TYPE_ICON: Record<string, string> = {
  manual: '📘', procedure: '📋', inspection: '🔍', work_order: '📝', pid: '🗺️',
}

function DocStatus({ status }: { status: string }) {
  if (status === 'indexed')    return <CheckCircle2 size={11} style={{ color: 'var(--success)', flexShrink: 0 }} />
  if (status === 'processing') return <Spinner size={11} />
  if (status === 'failed')     return <AlertCircle size={11} style={{ color: 'var(--danger)', flexShrink: 0 }} />
  return <Clock size={11} style={{ color: 'var(--text3)', flexShrink: 0 }} />
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '8px 12px' }} />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px 6px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3)' }}>
      {children}
    </div>
  )
}

export default function Sidebar() {
  const { activeTab, setActiveTab, backendOk, documents, removeDocument, setPreset, setActiveTab: navTo } = useStore()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const handleDelete = async (doc: Document) => {
    setDeleting(doc.id)
    try { await deleteDocument(doc.id); removeDocument(doc.id) }
    catch (e) { console.error(e) } finally { setDeleting(null) }
  }

  const indexed    = documents.filter(d => d.status === 'indexed').length
  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // ── Collapsed icon rail ───────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside style={{
        width: 68, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--sidebar)', borderRight: '1px solid var(--border)',
        alignItems: 'center', paddingTop: 16, gap: 4,
      }}>
        {/* Logo icon always visible */}
        <img src="/brand/logo-icon.png" alt="IndustrialMind"
          style={{ width: 52, height: 52, objectFit: 'contain', marginBottom: 10, filter: 'drop-shadow(0 0 12px var(--violet-glow))' }} />

        {/* Expand button */}
        <button onClick={() => setCollapsed(false)} title="Expand" style={{
          width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border2)',
          background: 'var(--card)', color: 'var(--text3)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 8, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--violet)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--violet-border)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border2)' }}>
          <ChevronRight size={15} />
        </button>

        {NAV.map(({ id, icon }) => {
          const active = activeTab === id
          return (
            <button key={id} onClick={() => setActiveTab(id)} title={id} style={{
              width: 40, height: 40, borderRadius: 10,
              border: active ? '1px solid var(--violet-border)' : '1px solid transparent',
              background: active ? 'var(--violet-dim)' : 'transparent',
              color: active ? 'var(--violet)' : 'var(--text3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'var(--card2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text1)' } }}
            onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text3)' } }}>
              {icon}
            </button>
          )
        })}
      </aside>
    )
  }

  // ── Expanded sidebar ──────────────────────────────────────────────────────
  return (
    <aside style={{
      width: 228, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--sidebar)', borderRight: '1px solid var(--border)', overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src="/brand/logo-icon.png" alt="IndustrialMind"
            style={{ width: 52, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 0 12px var(--violet-glow))' }} />
          <div style={{ flex: 1, marginLeft: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)', lineHeight: 1.2 }}>IndustrialMind</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>Enterprise AI Copilot</div>
          </div>
          <button onClick={() => setCollapsed(true)} title="Collapse" style={{
            width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--violet)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--violet-border)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
            ‹‹
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: backendOk ? 'var(--success)' : 'var(--danger)',
            boxShadow: backendOk ? '0 0 8px var(--success)' : '0 0 8px var(--danger)',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: backendOk ? 'var(--success)' : 'var(--danger)' }}>
            {backendOk ? 'Backend Connected' : 'Backend Offline'}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Navigation */}
        <div style={{ padding: '10px 10px 4px' }}>
          {NAV.map(({ id, icon, label }) => {
            const active = activeTab === id
            return (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, marginBottom: 1,
                border: active ? '1px solid var(--violet-border)' : '1px solid transparent',
                background: active ? 'var(--violet-dim)' : 'transparent',
                color: active ? 'var(--violet)' : 'var(--text2)',
                fontSize: 13, fontWeight: active ? 600 : 500,
                cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left',
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'var(--card2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text1)' } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' } }}>
                <span style={{ color: active ? 'var(--violet)' : 'var(--text3)', flexShrink: 0 }}>{icon}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                {active && <ChevronRight size={12} style={{ color: 'var(--violet)', flexShrink: 0 }} />}
              </button>
            )
          })}
        </div>

        <Divider />

        {/* Quick Actions */}
        <div style={{ padding: '0 10px' }}>
          <SectionLabel>Quick Actions</SectionLabel>
          {PRESETS.map(p => (
            <button key={p.label}
              onClick={() => { setPreset({ tab: p.tab, data: p.data as Record<string, string | undefined> }); setActiveTab(p.tab) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 10, marginBottom: 1,
                background: 'transparent', border: '1px solid transparent',
                color: 'var(--text2)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--card2)'; el.style.color = 'var(--text1)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--text2)' }}>
              <span style={{ color: 'var(--violet)' }}>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>

        <Divider />

        {/* Documents — top 5 */}
        <div style={{ padding: '0 10px 16px' }}>
          <SectionLabel>
            Documents
            {documents.length > 0 && (
              <span style={{ color: 'var(--violet)', textTransform: 'none', marginLeft: 4 }}>
                ({indexed}/{documents.length})
              </span>
            )}
          </SectionLabel>

          {documents.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--text3)', padding: '6px 6px' }}>No documents yet</p>
          ) : (
            <>
              {recentDocs.map(doc => (
                <div key={doc.id} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '6px 8px', borderRadius: 8, marginBottom: 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--card2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                  <DocStatus status={doc.status} />
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{TYPE_ICON[doc.doc_type] ?? '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{doc.page_count}p · {doc.chunk_count} chunks</div>
                  </div>
                  <button onClick={() => handleDelete(doc)} disabled={deleting === doc.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 2, opacity: 0, flexShrink: 0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>
                    {deleting === doc.id ? <Spinner size={10} /> : <X size={11} />}
                  </button>
                </div>
              ))}

              {documents.length > 5 && (
                <button onClick={() => setActiveTab('documents')} style={{
                  width: '100%', marginTop: 6, padding: '7px 10px', borderRadius: 10,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  color: 'var(--violet)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  View all {documents.length} <ChevronRight size={11} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Collapse label at bottom */}
      <button onClick={() => setCollapsed(true)} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', borderTop: '1px solid var(--border)',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--text3)', fontSize: 12, fontWeight: 500, transition: 'color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--violet)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>
        ‹‹ Collapse
      </button>
    </aside>
  )
}
