import { useRef, useState } from 'react'
import { Upload, ChevronRight, ChevronLeft } from 'lucide-react'
import { useStore } from '../../../store'
import { uploadDocument } from '../../../api/client'
import { Spinner } from '../../ui'
import ActivityPanel from './ActivityPanel'

const DOC_TYPES = [
  { value: 'procedure',  label: 'Procedure / Standard' },
  { value: 'manual',     label: 'OEM Manual' },
  { value: 'inspection', label: 'Inspection / Incident' },
  { value: 'work_order', label: 'Work Order / Permit' },
  { value: 'pid',        label: 'P&ID Diagram' },
]

export default function RightPanel({ showActivity }: { showActivity: boolean }) {
  const { plantId, setPlantId, backendOk, addDocument } = useStore()
  const [docType, setDocType]   = useState('procedure')
  const [uploading, setUpload]  = useState(false)
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUpload(true); setMsg(null)
    try {
      const res = await uploadDocument(file, docType, plantId)
      const d   = res.data
      addDocument({ id: d.doc_id, filename: file.name, doc_type: docType,
        page_count: d.page_count, chunk_count: d.chunk_count,
        status: 'indexed', plant_id: plantId, created_at: new Date().toISOString() })
      setMsg({ ok: true, text: `✓ ${d.chunk_count} chunks · ${d.entities_extracted} entities` })
      setTimeout(() => setMsg(null), 4000)
    } catch (err: any) {
      setMsg({ ok: false, text: `✗ ${err.response?.data?.detail ?? err.message}` })
    } finally {
      setUpload(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (collapsed) {
    return (
      <aside style={{
        width: 36, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--sidebar)', borderLeft: '1px solid var(--border)',
        alignItems: 'center', paddingTop: 16,
      }}>
        <button onClick={() => setCollapsed(false)} title="Expand panel" style={{
          width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border2)',
          background: 'var(--card)', color: 'var(--text3)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--violet)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>
          <ChevronLeft size={14} />
        </button>
      </aside>
    )
  }

  return (
    <aside style={{
      width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'var(--sidebar)', borderLeft: '1px solid var(--border)', overflow: 'hidden',
    }}>
      {/* Collapse toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 10px', borderBottom: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)' }}>
          Controls
        </span>
        <button onClick={() => setCollapsed(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 600, transition: 'color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--violet)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>
          <ChevronRight size={13} /> Collapse
        </button>
      </div>

      {/* Active Plant */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', display: 'block', marginBottom: 8 }}>
          Active Plant
        </label>
        <select value={plantId} onChange={e => setPlantId(e.target.value)} style={{
          width: '100%', background: 'var(--card)', border: '1px solid var(--border2)',
          borderRadius: 10, padding: '9px 12px', fontSize: 13,
          color: 'var(--text1)', outline: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--violet)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)' }}>
          {['plant_001','plant_002','plant_003'].map(p =>
            <option key={p} style={{ background: 'var(--card)' }}>{p}</option>
          )}
        </select>
      </div>

      {/* Knowledge Upload */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', display: 'block', marginBottom: 8 }}>
          Knowledge Upload
        </label>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
          Document Type
        </label>
        <select value={docType} onChange={e => setDocType(e.target.value)} style={{
          width: '100%', background: 'var(--card)', border: '1px solid var(--border2)',
          borderRadius: 10, padding: '9px 12px', fontSize: 13,
          color: 'var(--text1)', outline: 'none', cursor: 'pointer',
          fontFamily: 'inherit', marginBottom: 10,
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--violet)' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)' }}>
          {DOC_TYPES.map(o => <option key={o.value} value={o.value} style={{ background: 'var(--card)' }}>{o.label}</option>)}
        </select>

        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleUpload} style={{ display: 'none' }} />

        <button onClick={() => fileRef.current?.click()} disabled={uploading || !backendOk} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: uploading || !backendOk ? 'var(--card2)' : 'var(--grad-rust)',
          color: uploading || !backendOk ? 'var(--text3)' : '#fff',
          fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          boxShadow: uploading || !backendOk ? 'none' : '0 4px 16px var(--rust-glow)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!uploading && backendOk) (e.currentTarget as HTMLElement).style.transform = 'scale(1.02)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
          {uploading ? <Spinner size={14} /> : <Upload size={14} />}
          {uploading ? 'Ingesting…' : 'Upload PDF'}
        </button>

        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6, textAlign: 'center' }}>
          Supported formats: PDF, DOCX, TXT
        </p>

        {msg && (
          <div style={{
            marginTop: 8, fontSize: 11, padding: '7px 10px', borderRadius: 8, lineHeight: 1.4,
            background: msg.ok ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
            color: msg.ok ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${msg.ok ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
          }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Activity panel below */}
      {showActivity && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ActivityPanel />
        </div>
      )}
    </aside>
  )
}
