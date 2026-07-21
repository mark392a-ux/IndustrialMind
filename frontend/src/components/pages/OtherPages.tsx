import { useState, useEffect } from 'react'
import { Download, Trash2, CheckCircle2, RefreshCw, Search,
         AlertTriangle, CheckCircle, XCircle, FileText, Shield,
         Wrench, ClipboardList, AlertOctagon, BookOpen, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { runCompliance, compliancePdf, downloadBlob, generatePermit, permitPdf,
         getDocuments, deleteDocument, clearAllDocs, getGraphStats } from '../../api/client'
import { useStore } from '../../store'
import { Card, Input, Select, EmptyState, SourceChips, Spinner, Badge } from '../ui'
import type { ComplianceResult, PermitResult } from '../../types'

const STANDARDS = [
  { value: 'OISD-105',         label: 'OISD-105 — Inspection of Pressure Vessels' },
  { value: 'OISD-118',         label: 'OISD-118 — Layout for Oil and Gas Installations' },
  { value: 'Factory Act S.7B', label: 'Factory Act S.7B — General Duties of Occupier' },
  { value: 'Factory Act S.21', label: 'Factory Act S.21 — Fencing of Machinery' },
  { value: 'Factory Act S.31', label: 'Factory Act S.31 — Explosive / Inflammable Substances' },
  { value: 'PESO',             label: 'PESO — Petroleum & Explosives Safety Organisation' },
]
const WORK_TYPES = [
  'Mechanical maintenance','Hot work / welding','Confined space entry',
  'Electrical work','Instrument calibration','Scaffold erection','Chemical handling',
].map(v => ({ value: v, label: v }))

const SCAN_STEPS = [
  'Checking OISD requirements…','Checking PESO requirements…',
  'Checking Factory Act clauses…','Cross-referencing procedures…','Generating gap report…',
]

const PAGE_STYLE: React.CSSProperties = {
  height: '100%', overflowY: 'auto', padding: '28px 24px', background: 'var(--bg)',
}
const INNER: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' }
const GRID2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }

// ── Shared helpers ────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/^[═─■✔☐]{3,}.*$/gm, '')
    .replace(/^\s*\n/gm, '\n')
    .trim()
}

function ProseBlock({ text }: { text: string }) {
  if (!text?.trim()) return null
  return (
    <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanText(text)}</ReactMarkdown>
    </div>
  )
}

// ── Compliance report renderer ────────────────────────────────────────────────

function parseSeverity(text: string): 'critical' | 'major' | 'minor' | null {
  if (/critical/i.test(text)) return 'critical'
  if (/major/i.test(text)) return 'major'
  if (/minor/i.test(text)) return 'minor'
  return null
}

const SEV_STYLE = {
  critical: { bg: '#E53E3E22', border: '#E53E3E44', color: '#E53E3E', icon: <XCircle size={13} /> },
  major:    { bg: '#ED893622', border: '#ED893644', color: '#ED8936', icon: <AlertTriangle size={13} /> },
  minor:    { bg: '#F6AD5522', border: '#F6AD5544', color: '#ECC94B', icon: <AlertTriangle size={13} /> },
}

function GapCard({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean)
  const sev = parseSeverity(text)
  const style = sev ? SEV_STYLE[sev] : SEV_STYLE.minor

  // Extract structured fields
  const clause  = lines.find(l => /clause/i.test(l))?.replace(/clause\s*:/i, '').trim()
  const finding = lines.find(l => /finding/i.test(l))?.replace(/finding\s*:/i, '').trim()
  const impact  = lines.find(l => /impact/i.test(l))?.replace(/impact\s*:/i, '').trim()
  const evidence = lines.find(l => /evidence/i.test(l))?.replace(/evidence\s*:/i, '').trim()

  return (
    <div style={{
      background: style.bg, border: `1px solid ${style.border}`,
      borderRadius: 12, padding: '14px 16px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ color: style.color, display: 'flex' }}>{style.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: style.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {sev ?? 'Gap'} Severity
        </span>
        {clause && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: style.color,
            background: `${style.color}22`, padding: '2px 8px', borderRadius: 20, border: `1px solid ${style.border}` }}>
            {clause}
          </span>
        )}
      </div>
      {finding && (
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', marginBottom: 6 }}>{finding}</div>
      )}
      {evidence && (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6, fontStyle: 'italic' }}>
          Evidence: {evidence}
        </div>
      )}
      {impact && (
        <div style={{ fontSize: 12, color: 'var(--text2)', padding: '6px 10px',
          background: 'rgba(0,0,0,0.15)', borderRadius: 6 }}>
          ⚡ Impact: {impact}
        </div>
      )}
      {/* Fallback: if structured fields not found, render raw */}
      {!finding && !evidence && <ProseBlock text={text} />}
    </div>
  )
}

function CompliantItem({ text }: { text: string }) {
  const clean = text.replace(/^[•✓✔\-*]\s*/, '').trim()
  if (!clean) return null
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 12px', marginBottom: 6,
      background: '#48BB7811', border: '1px solid #48BB7833', borderRadius: 10,
    }}>
      <CheckCircle size={14} style={{ color: '#48BB78', flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.5 }}>{clean}</span>
    </div>
  )
}

function ActionItem({ text, index }: { text: string, index: number }) {
  const TIMELINES = ['Immediate', '30 days', '90 days']
  const timelineMatch = text.match(/timeline\s*:\s*([^.]+)/i)
  const timeline = timelineMatch?.[1]?.trim() ?? TIMELINES[index] ?? ''
  const clean = text
    .replace(/^\d+\.\s*/, '')
    .replace(/timeline\s*:.*$/i, '')
    .replace(/^[✔✓•\-]\s*/, '')
    .trim()

  const isImmediate = /immediate/i.test(timeline)
  const is30 = /30/i.test(timeline)

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 14px', marginBottom: 8,
      background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 10,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>
        {isImmediate ? '🚨' : is30 ? '🔧' : '📋'}
      </span>
      <div style={{ flex: 1 }}>
        {timeline && (
          <div style={{ fontSize: 11, fontWeight: 700, color: isImmediate ? '#E53E3E' : 'var(--violet)',
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
            {timeline}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.5 }}>{clean}</div>
      </div>
    </div>
  )
}

function SectionCard({ icon, title, children, accent }: {
  icon: React.ReactNode, title: string, children: React.ReactNode, accent?: string
}) {
  return (
    <div style={{
      background: 'var(--card)', border: `1px solid ${accent ?? 'var(--border)'}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
        background: accent ? `${accent}15` : 'var(--card2)',
        borderBottom: `1px solid ${accent ?? 'var(--border)'}`,
      }}>
        <span style={{ color: accent ?? 'var(--text3)', display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: accent ?? 'var(--text2)',
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function ComplianceReport({ answer, standard }: { answer: string, standard: string }) {
  const lines = answer.split('\n')

  // Parse sections
  type SectionKey = 'summary' | 'compliant' | 'gaps' | 'critical' | 'actions' | 'docs' | 'limitations' | 'other'
  const sections: Record<SectionKey, string[]> = {
    summary: [], compliant: [], gaps: [], critical: [],
    actions: [], docs: [], limitations: [], other: [],
  }
  let current: SectionKey = 'other'

  for (const line of lines) {
    if (/^[═─■]{3,}/.test(line.trim())) continue
    if (/executive summary/i.test(line))         { current = 'summary'; continue }
    if (/compliant items?/i.test(line))           { current = 'compliant'; continue }
    if (/compliance gaps?|gaps? identified/i.test(line) && !/critical/i.test(line)) { current = 'gaps'; continue }
    if (/critical non.conform/i.test(line))       { current = 'critical'; continue }
    if (/recommend|corrective action/i.test(line)){ current = 'actions'; continue }
    if (/documents? reviewed/i.test(line))        { current = 'docs'; continue }
    if (/audit limitation/i.test(line))           { current = 'limitations'; continue }
    sections[current].push(line)
  }

  const summaryText = sections.summary.join('\n').trim()

  // Extract score from summary
  const scoreMatch = summaryText.match(/score\s*[:\-]?\s*(\d+)\s*\/\s*10/i)
  const score = scoreMatch ? parseInt(scoreMatch[1]) : null
  const statusMatch = summaryText.match(/status\s*[:\-]?\s*([\w\s]+)/i)
  const status = statusMatch?.[1]?.trim()
  const scoreColor = score !== null ? (score >= 7 ? '#48BB78' : score >= 4 ? '#ED8936' : '#E53E3E') : 'var(--text2)'

  // Split gap section into individual gaps
  const gapBlocks: string[] = []
  let buf: string[] = []
  for (const line of sections.gaps) {
    if (/^GAP\s*\d/i.test(line.trim())) {
      if (buf.length) gapBlocks.push(buf.join('\n'))
      buf = [line]
    } else {
      buf.push(line)
    }
  }
  if (buf.length) gapBlocks.push(buf.join('\n'))

  // Split actions into individual items
  const actionLines = sections.actions
    .filter(l => /^\d+\.|^[✔✓•\-]/.test(l.trim()))
    .map(l => l.trim())
    .filter(Boolean)

  // Compliant items
  const compliantLines = sections.compliant
    .filter(l => l.trim() && !/^[═─■]{2,}/.test(l))
    .map(l => l.trim())
    .filter(Boolean)

  return (
    <div>
      {/* Score banner */}
      {(score !== null || status) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20, padding: '16px 20px', marginBottom: 12,
          background: 'linear-gradient(135deg, var(--card2), var(--card))',
          border: '1px solid var(--border)', borderRadius: 14,
        }}>
          {score !== null && (
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>out of 10</div>
            </div>
          )}
          <div style={{ flex: 1 }}>
            {status && (
              <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor, marginBottom: 4 }}>{status}</div>
            )}
            <ProseBlock text={summaryText
              .replace(/overall score[^.]*\./i, '')
              .replace(/status[^.]*\./i, '')
              .trim()} />
          </div>
        </div>
      )}

      {/* Critical non-conformances */}
      {sections.critical.some(l => l.trim() && !/none identified/i.test(l)) && (
        <SectionCard icon={<AlertOctagon size={14} />} title="Critical Non-Conformances" accent="#E53E3E">
          {sections.critical
            .filter(l => l.trim() && !/^[═─■]{2,}/.test(l))
            .map((l, i) => <div key={i} style={{ fontSize: 13, color: '#E53E3E', lineHeight: 1.6, marginBottom: 4 }}>• {l.replace(/^[•\-]\s*/, '')}</div>)}
        </SectionCard>
      )}

      {/* Gaps */}
      {gapBlocks.length > 0 && (
        <SectionCard icon={<AlertTriangle size={14} />} title={`Compliance Gaps — ${gapBlocks.length} found`} accent="#ED8936">
          {gapBlocks.map((block, i) => <GapCard key={i} text={block} />)}
        </SectionCard>
      )}

      {/* Compliant items */}
      {compliantLines.length > 0 && (
        <SectionCard icon={<CheckCircle size={14} />} title={`Compliant Items — ${compliantLines.length} found`} accent="#48BB78">
          {compliantLines.map((l, i) => <CompliantItem key={i} text={l} />)}
        </SectionCard>
      )}

      {/* Recommended actions */}
      {actionLines.length > 0 && (
        <SectionCard icon={<Wrench size={14} />} title="Recommended Corrective Actions">
          {actionLines.map((l, i) => <ActionItem key={i} text={l} index={i} />)}
        </SectionCard>
      )}

      {/* Audit limitations */}
      {sections.limitations.some(l => l.trim()) && (
        <SectionCard icon={<FileText size={14} />} title="Audit Limitations">
          <ProseBlock text={sections.limitations.join('\n')} />
        </SectionCard>
      )}
    </div>
  )
}

// ── Permit renderer ───────────────────────────────────────────────────────────

function PermitReport({ content }: { content: string }) {
  const lines = content.split('\n')

  type PermitSection = 'header' | 'work' | 'hazards' | 'loto' | 'ppe' | 'precautions' |
    'gas' | 'emergency' | 'checklist' | 'auth' | 'closure' | 'other'

  const sections: Record<PermitSection, string[]> = {
    header: [], work: [], hazards: [], loto: [], ppe: [],
    precautions: [], gas: [], emergency: [], checklist: [], auth: [], closure: [], other: [],
  }
  let current: PermitSection = 'header'

  for (const line of lines) {
    if (/^[═─■]{3,}/.test(line.trim())) continue
    if (/work description/i.test(line))           { current = 'work'; continue }
    if (/hazard identification/i.test(line))       { current = 'hazards'; continue }
    if (/isolation|loto/i.test(line))             { current = 'loto'; continue }
    if (/ppe requirement/i.test(line))             { current = 'ppe'; continue }
    if (/precaution|safety measure/i.test(line))   { current = 'precautions'; continue }
    if (/gas test/i.test(line))                    { current = 'gas'; continue }
    if (/emergency procedure/i.test(line))         { current = 'emergency'; continue }
    if (/sign.off checklist|pre.work/i.test(line)) { current = 'checklist'; continue }
    if (/authoris/i.test(line))                    { current = 'auth'; continue }
    if (/permit closure/i.test(line))              { current = 'closure'; continue }
    sections[current].push(line)
  }

  // Extract PTW details from work section
  const workText = sections.work.join('\n')
  const getField = (label: string) =>
    sections.work.find(l => new RegExp(label, 'i').test(l))
      ?.replace(new RegExp(`^${label}\\s*:?`, 'i'), '')
      ?.trim() ?? '—'

  const ptwNum = content.match(/PTW[\-\s](?:Number\s*:?\s*)?([A-Z0-9\-]+)/i)?.[1] ?? '—'
  const issued = content.match(/Date Issued\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? '—'
  const valid  = content.match(/Valid Until\s*:?\s*([^\n]+)/i)?.[1]?.trim() ?? '—'

  const hazardLines = sections.hazards.filter(l => /[•\-✔]/.test(l) || l.trim().length > 5).map(l => l.replace(/^[•\-✔]\s*/, '').trim()).filter(Boolean)
  const ppeLines    = sections.ppe.filter(l => /[•\-]/.test(l) || l.trim().length > 3).map(l => l.replace(/^[•\-]\s*/, '').trim()).filter(Boolean)
  const lotoLines   = sections.loto.filter(l => /✔|step/i.test(l)).map(l => l.replace(/^✔\s*Step\s*\d+\s*:/i, '').trim()).filter(Boolean)
  const checkItems  = sections.checklist.filter(l => /☐|✔|\d+\./.test(l)).map(l => l.replace(/^[☐✔]\s*\d*\.?\s*/, '').trim()).filter(Boolean)
  const [checkState, setCheckState] = useState<boolean[]>(() => checkItems.map(() => false))

  const gasLines = sections.gas.filter(l => l.trim() && !/^[═─■]{2,}/.test(l)).map(l => l.trim()).filter(Boolean)
  const authLines = sections.auth.filter(l => l.trim() && !/^[═─■]{2,}/.test(l)).map(l => l.trim()).filter(Boolean)

  return (
    <div>
      {/* PTW header strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, padding: '14px 16px',
        background: 'linear-gradient(135deg, rgba(237,137,54,0.12), var(--card2))',
        border: '1px solid rgba(237,137,54,0.3)', borderRadius: 14, marginBottom: 12,
      }}>
        {[
          { label: 'PTW Number', value: ptwNum },
          { label: 'Issued',     value: issued },
          { label: 'Valid Until', value: valid },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Work description */}
      {sections.work.length > 0 && (
        <SectionCard icon={<ClipboardList size={14} />} title="Work Description">
          <ProseBlock text={sections.work.join('\n')} />
        </SectionCard>
      )}

      {/* Two-col: Hazards + PPE */}
      {(hazardLines.length > 0 || ppeLines.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {hazardLines.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid #ED893644', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: '#ED893615', borderBottom: '1px solid #ED893644' }}>
                <AlertTriangle size={13} style={{ color: '#ED8936' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ED8936', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hazards</span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                {hazardLines.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)', padding: '4px 0', lineHeight: 1.5 }}>
                    <span style={{ color: '#ED8936', flexShrink: 0 }}>⚠</span>{h}
                  </div>
                ))}
              </div>
            </div>
          )}
          {ppeLines.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--card2)', borderBottom: '1px solid var(--border)' }}>
                <Shield size={13} style={{ color: 'var(--violet)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>PPE Required</span>
              </div>
              <div style={{ padding: '12px 14px' }}>
                {ppeLines.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)', padding: '4px 0', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--violet)', flexShrink: 0 }}>🦺</span>{p}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* LOTO */}
      {lotoLines.length > 0 && (
        <SectionCard icon={<Shield size={14} />} title="Isolation Requirements (LOTO)" accent="#7C3AED">
          {lotoLines.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < lotoLines.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: '#7C3AED22', border: '1px solid #7C3AED44',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: '#7C3AED',
              }}>{i + 1}</div>
              <span style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.6, paddingTop: 2 }}>{step}</span>
            </div>
          ))}
        </SectionCard>
      )}

      {/* Gas testing */}
      {gasLines.length > 0 && (
        <SectionCard icon={<AlertOctagon size={14} />} title="Gas Testing Requirements" accent="#E53E3E">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {gasLines.map((l, i) => {
              const [label, value] = l.split(':').map(s => s.trim())
              return value ? (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)' }}>{value}</div>
                </div>
              ) : (
                <div key={i} style={{ fontSize: 13, color: 'var(--text2)', gridColumn: '1/-1', padding: '4px 0' }}>{l}</div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* Emergency */}
      {sections.emergency.filter(l => l.trim()).length > 0 && (
        <SectionCard icon={<AlertOctagon size={14} />} title="Emergency Procedures" accent="#E53E3E">
          {sections.emergency
            .filter(l => l.trim() && !/^[═─■]{2,}/.test(l))
            .map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text2)', padding: '4px 0', lineHeight: 1.5 }}>
                <span style={{ color: '#E53E3E', flexShrink: 0, fontWeight: 700 }}>{i + 1}.</span>
                {l.replace(/^\d+\.\s*/, '')}
              </div>
            ))}
        </SectionCard>
      )}

      {/* Interactive checklist */}
      {checkItems.length > 0 && (
        <SectionCard icon={<ClipboardList size={14} />} title="Pre-Work Sign-Off Checklist" accent="#48BB78">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checkItems.map((item, i) => (
              <label key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                padding: '9px 12px', borderRadius: 8,
                background: checkState[i] ? '#48BB7811' : 'var(--card2)',
                border: `1px solid ${checkState[i] ? '#48BB7833' : 'var(--border)'}`,
                transition: 'all 0.15s',
              }}>
                <input type="checkbox" checked={checkState[i]}
                  onChange={() => setCheckState(s => s.map((v, j) => j === i ? !v : v))}
                  style={{ marginTop: 2, accentColor: '#48BB78', cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: checkState[i] ? '#48BB78' : 'var(--text1)',
                  textDecoration: checkState[i] ? 'line-through' : 'none',
                  transition: 'all 0.15s', lineHeight: 1.5 }}>{item}</span>
              </label>
            ))}
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>
              {checkState.filter(Boolean).length} / {checkItems.length} items confirmed
            </div>
          </div>
        </SectionCard>
      )}

      {/* Authorisations */}
      {authLines.length > 0 && (
        <SectionCard icon={<Users size={14} />} title="Authorisations">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {authLines.slice(0, 4).map((line, i) => {
              const [role, ...rest] = line.split(':')
              return (
                <div key={i} style={{ padding: '10px 12px', background: 'var(--card2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{role?.trim()}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {rest.join(':').trim() || 'Name: _____________  Sign: _______  Date: ________'}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ── Compliance Page ───────────────────────────────────────────────────────────
export function CompliancePage() {
  const { plantId, preset, clearPreset, addActivity, setTopSources } = useStore()
  const [standard, setStandard] = useState('OISD-105')
  const [loading, setLoading]   = useState(false)
  const [dl, setDl]             = useState(false)
  const [result, setResult]     = useState<ComplianceResult | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [scanStep, setScanStep] = useState(0)

  useEffect(() => {
    if (preset?.tab === 'compliance' && preset.data?.standard) { setStandard(preset.data.standard); clearPreset() }
  }, [preset])

  const run = async () => {
    setLoading(true); setError(null); setResult(null); setScanStep(0)
    addActivity({ icon: 'search', text: 'Compliance check started', sub: standard })
    const t = setInterval(() => setScanStep(s => Math.min(s + 1, SCAN_STEPS.length - 1)), 900)
    try {
      const res = await runCompliance(standard, plantId)
      setResult(res.data)
      if (res.data.sources?.length) setTopSources(res.data.sources)
      addActivity({ icon: 'done', text: 'Compliance report ready', sub: standard })
    } catch (err: any) {
      const status = err.response?.status
      if (status === 429) setError('⏱️ Rate limit reached. Please wait 30–60 seconds and try again.')
      else if (status === 503) setError('⚠️ AI service temporarily unavailable. Please try again in a moment.')
      else setError(err.response?.data?.detail ?? err.message)
    }
    finally { clearInterval(t); setLoading(false) }
  }

  const download = async () => {
    setDl(true)
    try { const r = await compliancePdf(standard, plantId); downloadBlob(r.data, `Compliance_${standard.replace(/ /g,'_')}.pdf`) }
    catch (e) { console.error(e) } finally { setDl(false) }
  }

  return (
    <div style={PAGE_STYLE}>
      <div style={INNER}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>🛡️ Compliance Gap Detector</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Cross-checks your plant procedures against industrial safety standards using DeepSeek R1
          </p>
        </div>
        <div style={GRID2}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 20 }}>Select Standard</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Select options={STANDARDS} value={standard} onChange={e => setStandard(e.target.value)} />
              <button onClick={run} disabled={loading} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: loading ? 'var(--card2)' : 'var(--violet-deep)',
                color: loading ? 'var(--text3)' : '#fff',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                boxShadow: loading ? 'none' : '0 4px 20px var(--violet-glow)',
                transition: 'all 0.15s',
              }}>
                {loading ? <Spinner size={15} /> : '🛡️'}
                {loading ? 'Scanning…' : 'Run Compliance Check'}
              </button>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>ISO 15926 Ontology</div>
                {['FunctionalObject','PhysicalObject','Activity','ClassOfEquipment','Document'].map(t => (
                  <div key={t} style={{ fontSize: 12, color: 'var(--text3)', padding: '3px 0' }}>• {t}</div>
                ))}
              </div>
            </div>
          </Card>

          <div>
            {error && (
              <Card style={{ padding: 20, borderColor: 'var(--rust-border)', background: 'rgba(248,113,113,0.05)', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10, color: 'var(--danger)', fontSize: 14, lineHeight: 1.6 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              </Card>
            )}
            {!result && !error && !loading && (
              <EmptyState icon="🛡️" title="Compliance report will appear here"
                subtitle="Select a standard and run the check to see compliance gaps, compliant items, and recommendations." />
            )}
            {loading && (
              <Card style={{ padding: 28 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 16 }}>Scanning…</div>
                <div style={{ height: 8, background: 'var(--card2)', borderRadius: 99, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{
                    height: '100%', borderRadius: 99, background: 'var(--grad-violet)',
                    width: `${((scanStep + 1) / SCAN_STEPS.length) * 100}%`, transition: 'width 0.45s ease',
                  }} />
                </div>
                {SCAN_STEPS.map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 8,
                    color: i <= scanStep ? 'var(--text1)' : 'var(--text3)',
                    opacity: i <= scanStep ? 1 : 0.35, transition: 'all 0.3s' }}>
                    {i < scanStep ? '✓' : i === scanStep ? <Spinner size={13} /> : '○'} {s}
                  </div>
                ))}
              </Card>
            )}
            {result && (
              <Card className="anim-fade-up" glow="violet">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>
                      Compliance Report — <span style={{ color: 'var(--violet)' }}>{standard}</span>
                    </div>
                    {result.blocked && (
                      <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 3 }}>
                        ⚠️ Standard not in knowledge base — upload to run full audit
                      </div>
                    )}
                  </div>
                  {!result.blocked && (
                    <button onClick={download} disabled={dl} style={{
                      display: 'flex', gap: 7, alignItems: 'center', padding: '9px 16px',
                      borderRadius: 10, border: '1px solid var(--border2)',
                      background: 'var(--card2)', color: 'var(--text1)', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      {dl ? <Spinner size={13} /> : <Download size={13} />} PDF
                    </button>
                  )}
                </div>
                <div style={{ padding: '20px 22px' }}>
                  {result.blocked
                    ? <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{result.answer}</div>
                    : <ComplianceReport answer={result.answer} standard={standard} />
                  }
                  <SourceChips sources={result.sources} />
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Permit Page ───────────────────────────────────────────────────────────────
export function PermitPage() {
  const { plantId, addActivity, setTopSources } = useStore()
  const [equipmentId, setEquipmentId] = useState('')
  const [workType, setWorkType]       = useState('Mechanical maintenance')
  const [location, setLocation]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [dl, setDl]                   = useState(false)
  const [result, setResult]           = useState<PermitResult | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const generate = async () => {
    if (!equipmentId.trim() || !location.trim()) return
    setLoading(true); setError(null); setResult(null)
    addActivity({ icon: 'search', text: 'Generating permit', sub: equipmentId })
    try {
      const res = await generatePermit(equipmentId, workType, location, plantId)
      setResult(res.data)
      if (res.data.sources?.length) setTopSources(res.data.sources)
      addActivity({ icon: 'done', text: 'Permit generated', sub: equipmentId })
    } catch (err: any) {
      const status = err.response?.status
      if (status === 429) setError('⏱️ Rate limit reached. Please wait 30–60 seconds and try again.')
      else if (status === 503) setError('⚠️ AI service temporarily unavailable. Please try again.')
      else setError(err.response?.data?.detail ?? err.message)
    }
    finally { setLoading(false) }
  }

  const download = async () => {
  if (!result) return

  setDl(true)

  try {
    const r = await permitPdf(
      equipmentId,
      workType,
      location,
      plantId
    )

    downloadBlob(
      r.data,
      `Permit_${equipmentId}.pdf`
    )
  } catch (e) {
    console.error(e)
  } finally {
    setDl(false)
  }
}

  return (
    <div style={PAGE_STYLE}>
      <div style={INNER}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>📄 Work Permit Generator ⭐</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Auto-generates permit-to-work with safety checks pulled from your plant procedure documents
          </p>
        </div>
        <div style={GRID2}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 20 }}>Permit Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Equipment ID" value={equipmentId} onChange={e => setEquipmentId(e.target.value)} placeholder="e.g. P-101A" />
              <Select label="Work Type" options={WORK_TYPES} value={workType} onChange={e => setWorkType(e.target.value)} />
              <Input label="Location / Area" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Unit 3, North Section" />
              <button onClick={generate} disabled={loading || !equipmentId.trim() || !location.trim()} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '13px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: loading || !equipmentId.trim() || !location.trim() ? 'var(--card2)' : 'var(--grad-rust)',
                color: loading || !equipmentId.trim() || !location.trim() ? 'var(--text3)' : '#fff',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                boxShadow: loading ? 'none' : '0 4px 20px var(--rust-glow)',
                transition: 'all 0.15s',
              }}>
                {loading ? <Spinner size={15} /> : '📄'}
                {loading ? 'Generating…' : 'Generate Permit'}
              </button>
            </div>
          </Card>

          <div>
            {error && (
              <Card style={{ padding: 20, borderColor: 'var(--rust-border)', background: 'rgba(248,113,113,0.05)', marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10, color: 'var(--danger)', fontSize: 14 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  {error}
                </div>
              </Card>
            )}
            {!result && !error && !loading && (
              <EmptyState icon="📝" title="Generate Your First Permit"
                subtitle="System pulls safety procedures from your document corpus and pre-fills all checklist items automatically."
                steps={['Select equipment', 'Choose work type', 'Generate permit automatically']} />
            )}
            {loading && (
              <Card style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
                <Spinner size={22} />
                <span style={{ fontSize: 14, color: 'var(--text2)' }}>Pulling safety procedures and generating permit…</span>
              </Card>
            )}
            {result && (
              <Card className="anim-fade-up" glow="rust">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>
                      Permit to Work — <span style={{ color: 'var(--rust)' }}>{equipmentId}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {result.ptw_number && `${result.ptw_number} · `}
                      {result.date_issued && `Issued: ${result.date_issued}`}
                    </div>
                  </div>
                  <button onClick={download} disabled={dl} style={{
                    display: 'flex', gap: 7, alignItems: 'center', padding: '9px 16px',
                    borderRadius: 10, border: '1px solid var(--border2)',
                    background: 'var(--card2)', color: 'var(--text1)', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {dl ? <Spinner size={13} /> : <Download size={13} />} PDF
                  </button>
                </div>
                <div style={{ padding: '20px 22px' }}>
                  <PermitReport content={result.permit_content} />
                  <SourceChips sources={result.sources} />
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Documents Page ────────────────────────────────────────────────────────────
export function DocumentsPage({ onRefreshStats }: { onRefreshStats?: () => Promise<void> }) {
  const { plantId, documents, setDocuments, removeDocument, clearDocuments } = useStore()
  const [loading, setLoading]   = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const refresh = async () => {
    setLoading(true)
    try { setDocuments((await getDocuments(plantId)).data) }
    catch (e) { console.error(e) } finally { setLoading(false) }
  }
  const handleDelete = async (id: string) => {
    setDeleting(id)
    try { await deleteDocument(id); removeDocument(id); await onRefreshStats?.() }
    catch (e) { console.error(e) } finally { setDeleting(null) }
  }
  const handleClear = async () => {
    if (!confirm('Delete all documents and KG nodes?')) return
    setClearing(true)
    try { await clearAllDocs(plantId); clearDocuments(); await onRefreshStats?.() }
    catch (e) { console.error(e) } finally { setClearing(false) }
  }

  const typeColor: Record<string, any> = {
    manual: 'violet', procedure: 'green', inspection: 'rust', work_order: 'rust', pid: 'muted',
  }
  const counts = documents.reduce((a, d) => { a[d.doc_type] = (a[d.doc_type]??0)+1; return a }, {} as Record<string,number>)
  const filtered = documents.filter(d => {
    const ms = !search || d.filename.toLowerCase().includes(search.toLowerCase())
    const mt = typeFilter === 'all' || d.doc_type === typeFilter
    return ms && mt
  })
  const FILTERS = [
    { value: 'all', label: 'All Types' },
    { value: 'procedure', label: '📋 Procedure' },
    { value: 'manual', label: '📘 Manual' },
    { value: 'inspection', label: '🔍 Inspection' },
    { value: 'work_order', label: '📝 Work Order' },
    { value: 'pid', label: '🗺️ P&ID' },
  ]

  return (
    <div style={PAGE_STYLE}>
      <div style={INNER}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>📁 Document Library</h2>
            <p style={{ fontSize: 14, color: 'var(--text3)', marginTop: 5 }}>
              {filtered.length} of {documents.length} documents · {documents.reduce((s,d)=>s+d.chunk_count,0).toLocaleString()} total chunks
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refresh} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              {loading ? <Spinner size={13} /> : <RefreshCw size={13} />} Refresh
            </button>
            {documents.length > 0 && (
              <button onClick={handleClear} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', color: 'var(--danger)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                {clearing ? <Spinner size={13} /> : <Trash2 size={13} />} Clear All
              </button>
            )}
          </div>
        </div>
        {documents.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 200 }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by filename…"
                style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border2)', color: 'var(--text1)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--violet)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'var(--border2)' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FILTERS.map(f => {
                const cnt = f.value === 'all' ? documents.length : (counts[f.value]??0)
                if (f.value !== 'all' && cnt === 0) return null
                const active = typeFilter === f.value
                return (
                  <button key={f.value} onClick={() => setTypeFilter(f.value)} style={{
                    padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: active ? 'var(--violet-dim)' : 'var(--card)',
                    border: `1px solid ${active ? 'var(--violet-border)' : 'var(--border)'}`,
                    color: active ? 'var(--violet)' : 'var(--text2)',
                    transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
                  }}>
                    {f.label} <span style={{ opacity: 0.6, fontSize: 11 }}>{cnt}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {documents.length === 0 ? (
          <EmptyState icon="📁" title="No documents indexed" subtitle="Upload PDFs using the panel on the right to build your knowledge base." />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="No matching documents" subtitle="Try a different search term or clear the filter." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
            {filtered.map(doc => (
              <Card key={doc.id} className="anim-fade-up" style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      {doc.status === 'indexed' ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> : <Spinner size={14} />}
                      <Badge variant={typeColor[doc.doc_type] ?? 'muted'}>{doc.doc_type}</Badge>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>
                      {doc.filename}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5 }}>{doc.page_count} pages · {doc.chunk_count} chunks</div>
                  </div>
                  <button onClick={() => handleDelete(doc.id)} disabled={deleting === doc.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, flexShrink: 0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}>
                    {deleting === doc.id ? <Spinner size={13} /> : <Trash2 size={14} />}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ROI Page ──────────────────────────────────────────────────────────────────
export function ROIPage() {
  const { documents } = useStore()
  const [engineers, setEngineers] = useState(50)
  const [rate, setRate]           = useState(800)
  const [searches, setSearches]   = useState(30)
  const [timeSaved, setTimeSaved] = useState(40)

  const monthlyHrs  = engineers * searches * timeSaved / 60 * 22
  const monthlySave = monthlyHrs * rate
  const annualSave  = monthlySave * 12

  const Slider = ({ label, value, set, min, max, step = 1, fmt }: any) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ color: 'var(--violet)', fontWeight: 700 }}>{fmt ? fmt(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => set(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--violet)', cursor: 'pointer', height: 4 }} />
    </div>
  )

  return (
    <div style={PAGE_STYLE}>
      <div style={INNER}>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>💰 ROI Calculator</h2>
          <p style={{ fontSize: 14, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
            Estimate cost savings from deploying IndustrialMind across your operations team
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24 }}>
          <Card style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 0 }}>Parameters</h3>
            <Slider label="Engineers using system" value={engineers} set={setEngineers} min={5} max={500} />
            <Slider label="Avg hourly rate" value={rate} set={setRate} min={200} max={5000} step={100} fmt={(v:number) => `₹${v.toLocaleString()}`} />
            <Slider label="Searches per day" value={searches} set={setSearches} min={5} max={200} />
            <Slider label="Minutes saved per search" value={timeSaved} set={setTimeSaved} min={5} max={120} />
          </Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { label: 'Monthly Savings', value: `₹${(monthlySave/100000).toFixed(1)}L`, sub: `${monthlyHrs.toFixed(0)} hours/month`, color: 'var(--violet)', glow: 'violet' as const },
                { label: 'Annual Savings',  value: `₹${(annualSave/100000).toFixed(0)}L`,  sub: `${(annualSave/10000000).toFixed(2)} crore/year`, color: 'var(--rust)', glow: 'rust' as const },
              ].map(({ label, value, sub, color, glow }) => (
                <Card key={label} glow={glow} style={{ padding: 28, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 5 }}>{sub}</div>
                </Card>
              ))}
            </div>
            <Card style={{ padding: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Breakdown</div>
              {[
                { label: 'Engineers', value: engineers },
                { label: 'Searches / day', value: searches },
                { label: 'Minutes saved / search', value: timeSaved },
                { label: 'Hours saved / month', value: monthlyHrs.toFixed(0), accent: true },
                { label: 'Cost saved / month', value: `₹${(monthlySave/100000).toFixed(2)}L`, accent: true },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: accent ? 'var(--violet)' : 'var(--text1)' }}>{value}</span>
                </div>
              ))}
            </Card>
            {documents.length > 0 && (
              <Card style={{ padding: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Your Knowledge Base</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, textAlign: 'center' }}>
                  {[{l:'Documents',v:documents.length},{l:'Pages',v:documents.reduce((s,d)=>s+d.page_count,0)},{l:'Chunks',v:documents.reduce((s,d)=>s+d.chunk_count,0)}].map(({l,v}) => (
                    <div key={l}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)' }}>{v.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}