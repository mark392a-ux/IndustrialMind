import { useState, useEffect, useRef } from 'react'
import { Send, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { sendChat } from '../../api/client'
import { useStore } from '../../store'
import { SourceChips, AgentBadge, TypingDots, EmptyState } from '../ui'
import type { ChatMessage } from '../../types'

const CARDS = [
  { icon: '📋', title: 'OISD Inspection',       q: 'What does OISD-105 require for pressure vessel inspection?' },
  { icon: '⚙️', title: 'Pump Maintenance',      q: 'What is the recommended maintenance schedule for a process pump?' },
  { icon: '🔥', title: 'Hot Work Safety',        q: 'What PPE and permits are needed for hot work near storage tanks?' },
  { icon: '🚨', title: 'Emergency Shutdown',     q: 'What are the emergency shutdown steps for a gas leak?' },
  { icon: '📊', title: 'Petroleum Rules',      q: 'What do the Petroleum Rules require for fuel storage safety?' },
  { icon: '🧪', title: 'CSB Incident Learnings', q: 'What lessons were learned from the Philadelphia refinery fire?' },
]

const STEPS = [
  { icon: 'search',   text: 'Searching documents…',        sub: (n: number) => `Scanning ${n} documents` },
  { icon: 'retrieve', text: 'Retrieving relevant content…', sub: () => 'Finding best matches' },
  { icon: 'graph',    text: 'Traversing Knowledge Graph…',  sub: () => 'Exploring entity connections' },
  { icon: 'reason',   text: 'Running DeepSeek reasoning…',  sub: () => 'Analysing and reasoning' },
  { icon: 'generate', text: 'Generating response…',         sub: () => 'Compiling answer and citations' },
]

export default function CopilotPage() {
  const { plantId, sessionId, setSessionId, preset, clearPreset,
          documents, addActivity, setTopSources } = useStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [stepIdx, setStepIdx]   = useState(-1)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)
  const timer                   = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (preset?.tab === 'copilot' && preset.data?.query) {
      setInput(preset.data.query); clearPreset(); inputRef.current?.focus()
    }
  }, [preset])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const startSteps = () => {
    setStepIdx(0)
    let i = 0
    timer.current = setInterval(() => {
      i++
      if (i < STEPS.length) { setStepIdx(i); addActivity({ icon: STEPS[i].icon, text: STEPS[i].text, sub: STEPS[i].sub(documents.length) }) }
      else if (timer.current) clearInterval(timer.current)
    }, 1400)
  }

  const stopSteps = () => { if (timer.current) clearInterval(timer.current); setStepIdx(-1) }

  const send = async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setLoading(true)
    addActivity({ icon: 'search', text: 'Searching documents…', sub: `Scanning ${documents.length} documents` })
    startSteps()
    try {
      const res = await sendChat(q, sessionId, plantId)
      setSessionId(res.data.session_id)
      const sources = res.data.sources ?? []
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer, sources, agent: res.data.agent }])
      if (sources.length) setTopSources(sources)
      addActivity({ icon: 'done', text: 'Response ready', sub: `${sources.length} sources cited` })
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${err.response?.data?.detail ?? err.message}`, sources: [] }])
    } finally { stopSteps(); setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Page title bar */}
      <div style={{ flexShrink: 0, padding: '16px 24px 14px', borderBottom: '1px solid var(--border)', background: 'var(--sidebar)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text1)' }}>💬 Expert Knowledge Copilot</h2>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Ask anything · hybrid retrieval · source citations · powered by Groq llama-3.3-70b · Gemini 1.5 Flash fallback</p>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setSessionId(null) }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10,
            background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text2)',
            fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}>
            <Trash2 size={13} /> Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {messages.length === 0 ? (
          <div className="anim-fade-up" style={{ maxWidth: 740, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ fontSize: 48, marginBottom: 14, filter: 'drop-shadow(0 0 20px var(--violet-glow))' }}>💬</div>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text1)', marginBottom: 10 }}>Ask IndustrialMind anything</h3>
              <p style={{ fontSize: 14, color: 'var(--text3)', maxWidth: 480, margin: '0 auto', lineHeight: 1.7 }}>
                Questions about procedures, maintenance intervals, equipment specs,<br />
                regulations — all answered with source citations from your document corpus.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {CARDS.map(c => (
                <button key={c.q} onClick={() => send(c.q)} style={{
                  padding: '18px 16px', borderRadius: 16, textAlign: 'left', cursor: 'pointer',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 8,
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--violet-border)'; el.style.background = 'var(--violet-dim)'; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = '0 8px 24px var(--violet-glow)' }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border)'; el.style.background = 'var(--card)'; el.style.transform = 'none'; el.style.boxShadow = 'none' }}>
                  <span style={{ fontSize: 26 }}>{c.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text1)' }}>{c.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>{c.q}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {messages.map((msg, i) => (
              <div key={i} className="anim-fade-up" style={{ display: 'flex', gap: 12, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  background: msg.role === 'user' ? 'var(--rust-dim)' : 'var(--violet-dim)',
                  border: `1px solid ${msg.role === 'user' ? 'var(--rust-border)' : 'var(--violet-border)'}`,
                }}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div style={{
                  maxWidth: '76%',
                  background: msg.role === 'user' ? 'var(--card2)' : 'var(--card)',
                  border: `1px solid ${msg.role === 'user' ? 'var(--border2)' : 'var(--border)'}`,
                  borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  padding: '14px 18px',
                }}>
                  <div className="prose-im"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
                  {msg.sources && <SourceChips sources={msg.sources} />}
                  {msg.agent && <div style={{ marginTop: 8 }}><AgentBadge agent={msg.agent} /></div>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="anim-fade-up" style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--violet-dim)', border: '1px solid var(--violet-border)', fontSize: 16 }}>🤖</div>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '4px 16px 16px 16px', padding: '14px 18px' }}>
                  <TypingDots />
                  {stepIdx >= 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {STEPS.slice(0, stepIdx + 1).map((s, si) => (
                        <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: si === stepIdx ? 'var(--violet)' : 'var(--text3)', fontWeight: si === stepIdx ? 600 : 400, opacity: si === stepIdx ? 1 : 0.5 }}>
                          <span>{si === stepIdx ? '⏳' : '✓'}</span>{s.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, padding: '14px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--sidebar)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 16, padding: '10px 14px' }}
            onClick={() => inputRef.current?.focus()}>
            <input ref={inputRef} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask about procedures, maintenance, standards, equipment…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--text1)', fontFamily: 'inherit' }} />
            <button onClick={() => send()} disabled={!input.trim() || loading} style={{
              width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
              background: !input.trim() || loading ? 'var(--card2)' : 'var(--grad-rust)',
              color: !input.trim() || loading ? 'var(--text3)' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: !input.trim() || loading ? 'none' : '0 4px 12px var(--rust-glow)',
              transition: 'all 0.15s', flexShrink: 0,
            }}>
              <Send size={15} />
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>
            ✨ IndustrialMind uses DeepSeek R1 for reasoning and Groq for fast responses
          </p>
        </div>
      </div>
    </div>
  )
}
