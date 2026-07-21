import { useState, useEffect, useRef } from 'react'
import { Download, AlertTriangle, CheckCircle, Clock, TrendingUp, FileText, Shield, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { runRca, rcaPdf, downloadBlob } from '../../api/client'
import { useStore } from '../../store'
import { Card, Input, Textarea, EmptyState, SourceChips, Spinner } from '../ui'
import type { RCAResult } from '../../types'

const CHAIN = [
  { icon: '🔍', label: 'Symptom extraction',    sub: 'Query expansion via Groq' },
  { icon: '📚', label: 'RAG retrieval',          sub: 'Vector + BM25 + Cohere rerank' },
  { icon: '🕸️', label: 'Graph traversal',        sub: 'ISO 15926 knowledge graph' },
  { icon: '🧠', label: 'DeepSeek R1 reasoning', sub: 'Chain-of-thought synthesis' },
  { icon: '📄', label: 'PDF generation',         sub: 'ReportLab output' },
]

// ── Section parser ────────────────────────────────────────────────────────────
// Splits the raw RCA text into named sections so we can render each differently
function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const divider = /^[═─]{3,}.*$/m

  // Extract named blocks between dividers
  const SECTION_PATTERNS: [string, RegExp][] = [
    ['executive',     /executive summary/i],
    ['immediate',     /immediate cause/i],
    ['fiveWhy',       /5-why|five.why|root cause analysis.*logic/i],
    ['technical',     /technical analysis|probable cause/i],
    ['contributing',  /contributing factor/i],
    ['risk',          /risk assessment/i],
    ['standards',     /applicable standard/i],
    ['similar',       /similar incident|lessons learned/i],
    ['corrective',    /corrective action/i],
    ['preventive',    /preventive action/i],
    ['checklist',     /inspection checklist|maintenance.*checklist/i],
    ['sources',       /source document|retrieval metric/i],
  ]

  const lines = text.split('\n')
  let currentSection = 'preamble'
  let buffer: string[] = []

  for (const line of lines) {
    // Skip pure divider lines
    if (/^[═─■]{4,}/.test(line.trim())) continue

    // Check if this line is a section header
    let matched = false
    for (const [key, pattern] of SECTION_PATTERNS) {
      if (pattern.test(line)) {
        // Save previous buffer
        if (buffer.length) sections[currentSection] = buffer.join('\n').trim()
        currentSection = key
        buffer = []
        matched = true
        break
      }
    }
    if (!matched) buffer.push(line)
  }
  if (buffer.length) sections[currentSection] = buffer.join('\n').trim()
  return sections
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ icon, title, children, accent }: {
  icon: React.ReactNode, title: string, children: React.ReactNode, accent?: string
}) {
  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${accent ?? 'var(--border)'}`,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 18px',
        background: accent ? `${accent}15` : 'var(--card2)',
        borderBottom: `1px solid ${accent ?? 'var(--border)'}`,
      }}>
        <span style={{ color: accent ?? 'var(--text2)', display: 'flex' }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent ? accent : 'var(--text1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  )
}

function ProseBlock({ text }: { text: string }) {
  if (!text?.trim()) return null
  // Clean up remaining box-drawing chars and render as markdown
  const cleaned = text
    .replace(/^[═─■✔☐]{2,}.*$/gm, '')   // remove divider lines
    .replace(/^\d+\.\s*$/gm, '')          // remove bare number lines
    .trim()
  return (
    <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown>
    </div>
  )
}

function WhyChain({ text }: { text: string }) {
  // Parse "Why N: ..." lines
  const whyLines = text.split('\n')
    .filter(l => /why\s*\d|root cause/i.test(l))
    .map(l => l.replace(/^why\s*\d+\s*(\(root cause\))?\s*:/i, '').trim())
    .filter(Boolean)

  if (!whyLines.length) return <ProseBlock text={text} />

  const colors = ['#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95', '#E53E3E']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {whyLines.map((why, i) => (
        <div key={i} style={{ display: 'flex', gap: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: i === whyLines.length - 1 ? '#E53E3E22' : `${colors[i]}22`,
              border: `2px solid ${i === whyLines.length - 1 ? '#E53E3E' : colors[i]}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: i === whyLines.length - 1 ? '#E53E3E' : colors[i],
            }}>
              {i === whyLines.length - 1 ? '!' : i + 1}
            </div>
            {i < whyLines.length - 1 && (
              <div style={{ width: 2, flex: 1, minHeight: 16, background: `${colors[i]}44` }} />
            )}
          </div>
          <div style={{
            flex: 1, padding: '4px 12px 16px',
            fontSize: 13, color: 'var(--text1)', lineHeight: 1.6,
          }}>
            {i === whyLines.length - 1
              ? <strong style={{ color: '#E53E3E' }}>Root Cause: {why}</strong>
              : why}
          </div>
        </div>
      ))}
    </div>
  )
}

function CausesTable({ text }: { text: string }) {
  // Try to detect markdown table rows
  const rows = text.split('\n')
    .filter(l => l.includes('|') && !l.match(/^[\s|:-]+$/))
    .map(l => l.split('|').map(c => c.trim()).filter(Boolean))

  if (rows.length < 2) return <ProseBlock text={text} />
  const [header, ...body] = rows

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i} style={{
                padding: '8px 12px', textAlign: 'left', fontSize: 11,
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                color: 'var(--text3)', borderBottom: '2px solid var(--border)',
                background: 'var(--card2)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
              {row.map((cell, ci) => {
                const isLow = /low/i.test(cell)
                const isMed = /medium|moderate/i.test(cell)
                const isHigh = /high/i.test(cell)
                const isInsuff = /insufficient/i.test(cell)
                return (
                  <td key={ci} style={{ padding: '10px 12px', color: 'var(--text2)', verticalAlign: 'top' }}>
                    {(isLow || isMed || isHigh) ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: isHigh ? '#E53E3E22' : isMed ? '#F6AD5522' : '#48BB7822',
                        color: isHigh ? '#E53E3E' : isMed ? '#ED8936' : '#48BB78',
                        border: `1px solid ${isHigh ? '#E53E3E44' : isMed ? '#F6AD5544' : '#48BB7844'}`,
                      }}>{cell}</span>
                    ) : isInsuff ? (
                      <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>{cell}</span>
                    ) : cell}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActionsList({ text, color }: { text: string, color: string }) {
  const lines = text.split('\n')
    .filter(l => /immediate|short.term|long.term|✔|^\d+\./i.test(l))
    .map(l => l.replace(/^[✔✓\d+\.]\s*/, '').trim())
    .filter(Boolean)

  if (!lines.length) return <ProseBlock text={text} />

  const labels = ['Immediate (24 hrs)', 'Short-Term (30 days)', 'Long-Term (90 days)']
  const icons = ['🚨', '🔧', '📋']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {lines.map((line, i) => (
        <div key={i} style={{
          display: 'flex', gap: 12, padding: '12px 14px',
          background: 'var(--card2)', borderRadius: 10,
          border: `1px solid var(--border)`,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[i] ?? '✔'}</span>
          <div>
            {labels[i] && (
              <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                {labels[i]}
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.6 }}>{line}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function Checklist({ text }: { text: string }) {
  const items = text.split('\n')
    .filter(l => /inspect|measure|verify|check|test/i.test(l))
    .map(l => l.replace(/^[☐✔✓\-•*]\s*/, '').trim())
    .filter(Boolean)

  if (!items.length) return <ProseBlock text={text} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <label key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
          padding: '8px 10px', borderRadius: 8, background: 'var(--card2)',
          border: '1px solid var(--border)',
        }}>
          <input type="checkbox" style={{ marginTop: 2, accentColor: 'var(--violet)', cursor: 'pointer' }} />
          <span style={{ fontSize: 13, color: 'var(--text1)', lineHeight: 1.5 }}>{item}</span>
        </label>
      ))}
    </div>
  )
}

// ── Structured RCA Report ─────────────────────────────────────────────────────
function RCAReport({ answer, equipmentId }: { answer: string, equipmentId: string }) {
  const s = parseSections(answer)

  // Extract severity from risk section
  const riskText = s.risk ?? ''
  const isCritical = /critical/i.test(riskText)
  const isHigh = /\bhigh\b/i.test(riskText) && !isCritical
  const riskColor = isCritical ? '#E53E3E' : isHigh ? '#ED8936' : '#48BB78'
  const riskLabel = isCritical ? 'CRITICAL' : isHigh ? 'HIGH' : 'MEDIUM'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* Executive Summary banner */}
      {s.executive && (
        <div style={{
          padding: '16px 20px', marginBottom: 8,
          background: 'linear-gradient(135deg, var(--violet-dim), var(--card2))',
          borderRadius: 12, border: '1px solid var(--violet-border)',
        }}>
          <ProseBlock text={s.executive} />
        </div>
      )}

      {/* Two-column: Immediate Cause + Risk */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        {s.immediate && (
          <SectionCard icon={<AlertTriangle size={14} />} title="Immediate Cause" accent="#ED8936">
            <ProseBlock text={s.immediate} />
          </SectionCard>
        )}
        {s.risk && (
          <SectionCard icon={<Shield size={14} />} title="Risk Assessment" accent={riskColor}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20, marginBottom: 10,
              background: `${riskColor}22`, border: `1px solid ${riskColor}44`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: riskColor }}>{riskLabel}</span>
            </div>
            <ProseBlock text={riskText.replace(/risk level.*?(critical|high|medium|low)/i, '')} />
          </SectionCard>
        )}
      </div>

      {/* 5-Why chain */}
      {s.fiveWhy && (
        <SectionCard icon={<TrendingUp size={14} />} title="5-Why Root Cause Chain" accent="#7C3AED">
          <WhyChain text={s.fiveWhy} />
        </SectionCard>
      )}

      {/* Technical Analysis table */}
      {s.technical && (
        <SectionCard icon={<FileText size={14} />} title="Technical Analysis — Probable Causes">
          <CausesTable text={s.technical} />
        </SectionCard>
      )}

      {/* Contributing Factors */}
      {s.contributing && (
        <SectionCard icon={<AlertTriangle size={14} />} title="Contributing Factors">
          <ProseBlock text={s.contributing} />
        </SectionCard>
      )}

      {/* Corrective Actions */}
      {s.corrective && (
        <SectionCard icon={<Wrench size={14} />} title="Corrective Actions" accent="#E53E3E">
          <ActionsList text={s.corrective} color="#E53E3E" />
        </SectionCard>
      )}

      {/* Preventive Actions */}
      {s.preventive && (
        <SectionCard icon={<CheckCircle size={14} />} title="Preventive Actions" accent="#48BB78">
          <ActionsList text={s.preventive} color="#48BB78" />
        </SectionCard>
      )}

      {/* Maintenance Checklist */}
      {s.checklist && (
        <SectionCard icon={<Clock size={14} />} title="Maintenance Inspection Checklist">
          <Checklist text={s.checklist} />
        </SectionCard>
      )}

      {/* Applicable Standards */}
      {s.standards && (
        <SectionCard icon={<Shield size={14} />} title="Applicable Standards">
          <ProseBlock text={s.standards} />
        </SectionCard>
      )}

      {/* Similar Incidents */}
      {s.similar && (
        <SectionCard icon={<FileText size={14} />} title="Similar Incidents & Lessons Learned">
          <ProseBlock text={s.similar} />
        </SectionCard>
      )}

    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RCAPage() {
  const { plantId, preset, clearPreset, addActivity, setTopSources } = useStore()
  const [equipmentId, setEquipmentId] = useState('')
  const [symptom, setSymptom]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [downloading, setDl]          = useState(false)
  const [result, setResult]           = useState<RCAResult | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [activeStep, setActiveStep]   = useState(-1)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (preset?.tab === 'rca' && preset.data) {
      setEquipmentId(preset.data.equipmentId ?? '')
      setSymptom(preset.data.symptom ?? '')
      clearPreset()
    }
  }, [preset])

  const run = async () => {
    if (!equipmentId.trim() || !symptom.trim()) return
    if (symptom.trim().length < 20) {
      setError('Please describe the failure in more detail (at least 20 characters). Include what happened, when discovered, and observed symptoms.')
      return
    }
    setLoading(true); setError(null); setResult(null); setActiveStep(0)
    addActivity({ icon: 'search', text: `RCA: ${equipmentId}`, sub: 'Extracting symptoms' })
    let i = 0
    timer.current = setInterval(() => {
      i++
      if (i < CHAIN.length) { setActiveStep(i); addActivity({ icon: 'reason', text: CHAIN[i].label, sub: CHAIN[i].sub }) }
      else if (timer.current) clearInterval(timer.current)
    }, 2000)
    try {
      const res = await runRca(equipmentId, symptom, plantId)
      // Handle rate limit / error responses
      if (res.data?.error) {
        setError(res.data.error)
        return
      }
      setResult(res.data)
      if (res.data.sources?.length) setTopSources(res.data.sources)
      addActivity({ icon: 'done', text: 'RCA complete', sub: `${res.data.sources?.length ?? 0} sources cited` })
    } catch (err: any) {
      const status = err.response?.status
      if (status === 429) {
        setError('⏱️ Rate limit reached. Please wait 30–60 seconds and try again. Your Groq free-tier quota resets automatically.')
      } else if (status === 503) {
        setError('⚠️ AI service temporarily unavailable. Please try again in a moment.')
      } else {
        setError(err.response?.data?.detail ?? err.message)
      }
    }
    finally { if (timer.current) clearInterval(timer.current); setLoading(false); setActiveStep(-1) }
  }

  const download = async () => {
    setDl(true)
    try { const r = await rcaPdf(equipmentId, symptom, plantId); downloadBlob(r.data, `RCA_${equipmentId}.pdf`) }
    catch (e) { console.error(e) } finally { setDl(false) }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '28px 24px', background: 'var(--bg)' }}>
      <div style={{ marginBottom: 28, maxWidth: 1100, margin: '0 auto 28px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text1)' }}>🔬 Root Cause Analysis Agent</h2>
        <p style={{ fontSize: 14, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
          5-step agentic chain: symptom extraction → RAG retrieval → graph traversal → DeepSeek R1 synthesis → PDF export
        </p>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{ padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 20 }}>Failure / Issue Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Input label="Equipment ID" value={equipmentId}
                onChange={e => setEquipmentId(e.target.value)}
                placeholder="e.g. P-101A, V-201, K-301" />
              <Textarea label="Failure Description" value={symptom}
                onChange={e => setSymptom(e.target.value)} rows={5}
                placeholder="Describe the failure symptom, alarm, or observed condition in detail…" />
              <button onClick={run}
                disabled={loading || !equipmentId.trim() || !symptom.trim()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '13px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: loading || !equipmentId.trim() || !symptom.trim() ? 'var(--card2)' : 'var(--violet-deep)',
                  color: loading || !equipmentId.trim() || !symptom.trim() ? 'var(--text3)' : '#fff',
                  fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  boxShadow: loading ? 'none' : '0 4px 20px var(--violet-glow)',
                  transition: 'all 0.15s',
                }}>
                {loading ? <Spinner size={15} /> : '🔬'}
                {loading ? 'Analysing…' : 'Start RCA Analysis'}
              </button>
              {!loading && (
                <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: -6 }}>
                  This will run a 5-step RCA analysis
                </p>
              )}
            </div>
          </Card>

          {/* Agent chain timeline */}
          <Card style={{ padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
              Agent Chain
            </div>
            {CHAIN.map((step, i) => {
              const done   = result !== null
              const active = loading && i === activeStep
              const past   = loading && i < activeStep
              return (
                <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < CHAIN.length - 1 ? 20 : 0, position: 'relative' }}>
                  {i < CHAIN.length - 1 && (
                    <div style={{ position: 'absolute', left: 15, top: 34, bottom: 0, width: 2, background: past || done ? 'var(--violet)' : 'var(--border)', transition: 'background 0.5s' }} />
                  )}
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0, zIndex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: active ? 12 : 15,
                    background: active ? 'var(--violet-deep)' : past || done ? 'var(--violet-dim)' : 'var(--card2)',
                    border: `2px solid ${active ? 'var(--violet)' : past || done ? 'var(--violet-border)' : 'var(--border)'}`,
                    boxShadow: active ? '0 0 14px var(--violet-glow)' : 'none',
                    transition: 'all 0.3s',
                  }}>
                    {active ? <Spinner size={12} /> : (past || done) ? '✓' : step.icon}
                  </div>
                  <div style={{ paddingTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--violet)' : past || done ? 'var(--text1)' : 'var(--text3)', transition: 'color 0.3s' }}>
                      {step.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{step.sub}</div>
                  </div>
                </div>
              )
            })}
          </Card>
        </div>

        {/* Right panel — report */}
        <div>
          {error && (
            <Card style={{ padding: 20, borderColor: 'var(--rust-border)', background: 'var(--rust-dim)', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, color: 'var(--danger)', fontSize: 14, lineHeight: 1.6 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
            </Card>
          )}

          {!result && !error && !loading && (
            <EmptyState icon="🔬" title="RCA results will appear here"
              subtitle="Enter equipment ID and failure description to run the 5-step analysis."
              steps={['Enter equipment ID + failure description', 'Agent retrieves docs + traverses KG', 'DeepSeek R1 synthesises root causes + actions']} />
          )}

          {loading && !result && (
            <Card style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 60, height: 60 }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid var(--violet-dim)', borderTopColor: 'var(--violet)', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🔬</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>{activeStep >= 0 ? CHAIN[activeStep].label : 'Initialising…'}</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>{activeStep >= 0 ? CHAIN[activeStep].sub : ''}</div>
              </div>
            </Card>
          )}

          {result && (
            <Card className="anim-fade-up" glow="violet">
              {/* Report header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text1)' }}>
                      RCA Report — <span style={{ color: 'var(--violet)' }}>{equipmentId}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Generated with DeepSeek R1 reasoning</div>
                  </div>
                  {result.metadata && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                        background: result.metadata.confidence === 'High' ? '#48BB7822' : result.metadata.confidence === 'Medium' ? '#F6AD5522' : '#E53E3E22',
                        color: result.metadata.confidence === 'High' ? '#48BB78' : result.metadata.confidence === 'Medium' ? '#ED8936' : '#E53E3E',
                        border: `1px solid ${result.metadata.confidence === 'High' ? '#48BB7844' : result.metadata.confidence === 'Medium' ? '#F6AD5544' : '#E53E3E44'}`,
                        textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                      }}>
                        Confidence: {result.metadata.confidence}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
                        background: 'var(--card2)', border: '1px solid var(--border)', color: 'var(--text2)',
                      }}>
                        {result.metadata.docs_retrieved} Docs · Score: {result.metadata.avg_rerank_score}
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={download} disabled={downloading} style={{
                  display: 'flex', gap: 7, alignItems: 'center', padding: '9px 16px',
                  borderRadius: 10, border: '1px solid var(--border2)',
                  background: 'var(--card2)', color: 'var(--text1)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  {downloading ? <Spinner size={13} /> : <Download size={13} />} Download PDF
                </button>
              </div>

              {/* Structured report body */}
              <div style={{ padding: '20px 22px' }}>
                <RCAReport answer={result.answer} equipmentId={equipmentId} />
                <div style={{ marginTop: 16 }}>
                  <SourceChips sources={result.sources} />
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}