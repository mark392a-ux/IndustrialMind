import { useEffect, useState, lazy, Suspense } from 'react'
import { getHealth, getDocuments, getGraphStats } from './api/client'
import { useStore } from './store'
import Sidebar from './components/pages/layout/Sidebar'
import Header from './components/pages/layout/Header'
import RightPanel from './components/pages/layout/RightPanel'
import { Spinner } from './components/ui'
import type { GraphStats } from './types'

// Code-split heavy pages
const CopilotPage    = lazy(() => import('./components/pages/CopilotPage'))
const RCAPage        = lazy(() => import('./components/pages/RCAPage'))
const GraphPage      = lazy(() => import('./components/pages/GraphPage'))
const CompliancePage = lazy(() => import('./components/pages/OtherPages').then(m => ({ default: m.CompliancePage })))
const PermitPage     = lazy(() => import('./components/pages/OtherPages').then(m => ({ default: m.PermitPage })))
const DocumentsPage  = lazy(() => import('./components/pages/OtherPages').then(m => ({ default: m.DocumentsPage })))
const ROIPage        = lazy(() => import('./components/pages/OtherPages').then(m => ({ default: m.ROIPage })))

function PageLoader() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Spinner size={28} />
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>Loading…</span>
      </div>
    </div>
  )
}

export default function App() {
  const { plantId, activeTab, theme } = useStore()
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null)

  // Apply theme class on mount and change
  useEffect(() => {
    document.documentElement.className = theme
  }, [theme])

  // Poll backend
  // Poll backend
useEffect(() => {
  const poll = async () => {
    try {
      await getHealth()
      useStore.getState().setBackendOk(true)

      const [docsRes, statsRes] = await Promise.all([
        getDocuments(plantId),
        getGraphStats(),
      ])

      useStore.getState().setDocuments(docsRes.data)
      setGraphStats(statsRes.data)
    } catch {
      useStore.getState().setBackendOk(false)
    }
  }

  poll()

  const id = setInterval(poll, 15_000)

  // ── Listen for immediate graph updates from delete actions ──
  const onGraphUpdated = (e: CustomEvent) => {
    if (e.detail) {
      setGraphStats(e.detail)
    }
  }

  window.addEventListener(
    'graph-updated',
    onGraphUpdated as EventListener
  )

  return () => {
    clearInterval(id)
    window.removeEventListener(
      'graph-updated',
      onGraphUpdated as EventListener
    )
  }
}, [plantId])

  // Show activity panel on AI-driven tabs
  const showActivity = ['copilot','rca','compliance','permit'].includes(activeTab)
  // Hide right panel on graph (full screen needs space)
  const showRightPanel = activeTab !== 'graph'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header graphStats={graphStats} />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Suspense fallback={<PageLoader />}>
              {activeTab === 'copilot'    && <CopilotPage />}
              {activeTab === 'rca'        && <RCAPage />}
              {activeTab === 'compliance' && <CompliancePage />}
              {activeTab === 'permit'     && <PermitPage />}
              {activeTab === 'graph'      && <GraphPage />}
              {activeTab === 'documents'  && <DocumentsPage />}
              {activeTab === 'roi'        && <ROIPage />}
            </Suspense>
          </main>
          {showRightPanel && <RightPanel showActivity={showActivity} />}
        </div>
      </div>
    </div>
  )
}
