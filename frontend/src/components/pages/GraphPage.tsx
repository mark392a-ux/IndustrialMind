import { useState, useEffect, useCallback, useRef } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeTypes,
  Handle, Position, Panel, useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Search, RefreshCw, X, Maximize2 } from 'lucide-react'
import { getGraphFull, getGraphStats, searchGraphApi } from '../../api/client'
import { useStore } from '../../store'
import { EmptyState, Spinner } from '../ui'
import type { GraphStats } from '../../types'

const NODE_CFG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  FunctionalObject:  { color: '#7974C3', bg: 'rgba(121,116,195,0.18)', border: 'rgba(121,116,195,0.5)', icon: '⚙️', label: 'Equipment'  },
  PhysicalObject:    { color: '#34D399', bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.45)', icon: '🔧', label: 'Instrument' },
  ClassOfEquipment:  { color: '#E1B7DD', bg: 'rgba(225,183,221,0.15)', border: 'rgba(225,183,221,0.45)', icon: '📋', label: 'Standard'  },
  Activity:          { color: '#C66247', bg: 'rgba(198,98,71,0.15)',   border: 'rgba(198,98,71,0.45)',   icon: '🔨', label: 'Activity'  },
  Document:          { color: '#FBBF24', bg: 'rgba(251,191,36,0.15)',  border: 'rgba(251,191,36,0.45)',  icon: '📄', label: 'Document'  },
}

function getNodeType(id: string): string {
  if (id.startsWith('doc:'))             return 'Document'
  if (id.startsWith('functionalobject')) return 'FunctionalObject'
  if (id.startsWith('physicalobject'))   return 'PhysicalObject'
  if (id.startsWith('classofequipment')) return 'ClassOfEquipment'
  if (id.startsWith('activity'))         return 'Activity'
  return 'Activity'
}

function CustomNode({ data }: { data: { label: string; nodeType: string; highlighted?: boolean; dimmed?: boolean } }) {
  const cfg = NODE_CFG[data.nodeType] ?? NODE_CFG.Activity
  const label = data.label.length > 26 ? data.label.slice(0, 23) + '…' : data.label
  return (
    <>
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, width: 6, height: 6 }} />
      <div style={{
        background: cfg.bg,
        border: `2px solid ${data.highlighted ? cfg.color : cfg.border}`,
        borderRadius: 10, padding: '6px 12px',
        display: 'flex', alignItems: 'center', gap: 6,
        minWidth: 90, maxWidth: 180,
        boxShadow: data.highlighted ? `0 0 22px ${cfg.color}70` : '0 2px 8px rgba(0,0,0,0.3)',
        opacity: data.dimmed ? 0.15 : 1,
        transition: 'all 0.25s ease', cursor: 'pointer',
        transform: data.highlighted ? 'scale(1.05)' : 'scale(1)',
      }}>
        <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{cfg.icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 6, height: 6 }} />
    </>
  )
}

const nodeTypes: NodeTypes = { custom: CustomNode }

// Force-directed layout — spreads nodes across canvas with much more spacing
function layoutNodes(
  rawNodes: Array<{ id: string; data: { label: string } }>,
  rawEdges: Array<{ id: string; source: string; target: string; label?: string }>
): { nodes: Node[]; edges: Edge[] } {
  const byType: Record<string, string[]> = {}
  rawNodes.forEach(n => {
    const t = getNodeType(n.id)
    if (!byType[t]) byType[t] = []
    byType[t].push(n.id)
  })

  const typeOrder = ['Document', 'FunctionalObject', 'PhysicalObject', 'ClassOfEquipment', 'Activity']
  const positions: Record<string, { x: number; y: number }> = {}

  // Calculate column widths based on count
  let xOffset = 0
  typeOrder.forEach((type) => {
    const ids = byType[type] ?? []
    if (ids.length === 0) return

    // How many rows of nodes in this column
    const ROWS_PER_COL = 12
    const cols = Math.ceil(ids.length / ROWS_PER_COL)
    const COL_W = 200

    ids.forEach((id, idx) => {
      const col = Math.floor(idx / ROWS_PER_COL)
      const row = idx % ROWS_PER_COL
      positions[id] = {
        x: xOffset + col * COL_W + (Math.random() - 0.5) * 20,
        y: row * 80 + 60 + (Math.random() - 0.5) * 12,
      }
    })

    xOffset += cols * COL_W + 120  // gap between type groups
  })

  const nodes: Node[] = rawNodes.map(n => ({
    id: n.id, type: 'custom',
    position: positions[n.id] ?? { x: Math.random() * 1400, y: Math.random() * 900 },
    data: { label: n.data?.label ?? n.id.split(':')[1] ?? n.id, nodeType: getNodeType(n.id) },
  }))

  const edges: Edge[] = rawEdges.map(e => ({
    id: e.id, source: e.source, target: e.target,
    label: e.label ?? '',
    style: { stroke: 'rgba(121,116,195,0.18)', strokeWidth: 1.5 },
    labelStyle: { fill: 'rgba(121,116,195,0.4)', fontSize: 9 },
    labelBgStyle: { fill: 'transparent' },
  }))
  return { nodes, edges }
}

function NodeDetail({ node, onClose }: { node: Node; onClose: () => void }) {
  const cfg = NODE_CFG[(node.data as any).nodeType] ?? NODE_CFG.Activity
  return (
    <div style={{
      width: 260, background: 'var(--card)', border: `1px solid ${cfg.border}`,
      borderRadius: 14, padding: 18,
      boxShadow: `0 12px 40px rgba(0,0,0,0.25), 0 0 24px ${cfg.color}20`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>{cfg.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex', padding: 2 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)', marginBottom: 8, wordBreak: 'break-word', lineHeight: 1.5 }}>
        {(node.data as any).label}
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace',
        background: 'var(--card2)', border: '1px solid var(--border)',
        padding: '7px 10px', borderRadius: 8, wordBreak: 'break-all', lineHeight: 1.6,
      }}>
        {node.id}
      </div>
    </div>
  )
}

// ── Main graph component ──────────────────────────────────────────────────────
function GraphInner() {
  const { plantId }       = useStore()
  const { fitView, setViewport, getNode } = useReactFlow()

  const [allNodes, setAllNodes]         = useState<Node[]>([])
  const [allEdges, setAllEdges]         = useState<Edge[]>([])
  const [nodes, setNodes, onNC]         = useNodesState([])
  const [edges, setEdges, onEC]         = useEdgesState([])
  const [stats, setStats]               = useState<GraphStats | null>(null)
  const [loading, setLoading]           = useState(false)
  const [query, setQuery]               = useState('')
  const [searching, setSearching]       = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [filterType, setFilterType]     = useState('all')
  const [focusedIds, setFocusedIds]     = useState<Set<string> | null>(null)
  const [searchResults, setSearchResults] = useState<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)

  const loadGraph = useCallback(async () => {
    setLoading(true)
    try {
      const [gRes, sRes] = await Promise.all([getGraphFull(plantId), getGraphStats()])
      const { nodes: n, edges: e } = layoutNodes(gRes.data.nodes as any, gRes.data.edges as any)
      setAllNodes(n); setAllEdges(e)
      setNodes(n); setEdges(e)
      setStats(sRes.data)
      setFocusedIds(null)
      setSearchResults([])
      setTimeout(() => fitView({ padding: 0.1, duration: 500 }), 150)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [plantId])

  useEffect(() => { loadGraph() }, [loadGraph])

  // Re-apply filter+focus whenever they change
  useEffect(() => {
    if (allNodes.length === 0) return

    let visibleIds: Set<string>
    if (focusedIds) {
      visibleIds = focusedIds
    } else if (filterType !== 'all') {
      visibleIds = new Set(allNodes.filter(n => (n.data as any).nodeType === filterType).map(n => n.id))
    } else {
      visibleIds = new Set(allNodes.map(n => n.id))
    }

    const searchSet = new Set(searchResults)

    setNodes(allNodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        dimmed: !visibleIds.has(n.id),
        highlighted: searchSet.has(n.id),
      },
    })))

    setEdges(allEdges.map(e => ({
      ...e,
      style: {
        stroke: visibleIds.has(e.source) && visibleIds.has(e.target)
          ? (searchSet.has(e.source) || searchSet.has(e.target) ? 'rgba(251,191,36,0.8)' : 'rgba(121,116,195,0.2)')
          : 'rgba(121,116,195,0.03)',
        strokeWidth: (searchSet.has(e.source) || searchSet.has(e.target)) ? 2.5 : 1.5,
        strokeDasharray: (searchSet.has(e.source) || searchSet.has(e.target)) ? '6 3' : undefined,
      },
    })))

    // Fit view to visible nodes after a short delay
    setTimeout(() => {
      if (focusedIds || filterType !== 'all') {
        const visibleNodes = allNodes.filter(n => visibleIds.has(n.id))
        if (visibleNodes.length > 0) {
          fitView({ padding: 0.2, duration: 500, nodes: visibleNodes })
        }
      }
    }, 80)
  }, [filterType, focusedIds, searchResults, allNodes, allEdges])

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) { clearSearch(); return }
    setSearching(true)
    try {
      const res = await searchGraphApi(q, plantId)
      const matchIds = (res.data.nodes ?? []).map((n: any) => n.id as string)
      setSearchResults(matchIds)

      if (matchIds.length > 0) {
        // Build subgraph: matched nodes + direct neighbors
        const focusSet = new Set<string>(matchIds)
        allEdges.forEach(e => {
          if (focusSet.has(e.source)) focusSet.add(e.target)
          if (focusSet.has(e.target)) focusSet.add(e.source)
        })
        setFocusedIds(focusSet)

        // Auto-zoom to the matched nodes specifically
        const matchedNodes = allNodes.filter(n => matchIds.includes(n.id))
        if (matchedNodes.length > 0) {
          setTimeout(() => {
            fitView({
              padding: 0.35,
              duration: 700,
              nodes: matchedNodes,
            })
          }, 100)
        }
      } else {
        setFocusedIds(null)
      }
    } catch (e) { console.error(e) }
    finally { setSearching(false) }
  }

  const expandNeighbors = () => {
    if (!focusedIds) return
    const expanded = new Set(focusedIds)
    allEdges.forEach(e => {
      if (expanded.has(e.source)) expanded.add(e.target)
      if (expanded.has(e.target)) expanded.add(e.source)
    })
    setFocusedIds(expanded)
  }

  const clearSearch = () => {
    setQuery('')
    setFocusedIds(null)
    setSearchResults([])
    setFilterType('all')
    setTimeout(() => fitView({ padding: 0.1, duration: 500 }), 80)
  }

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if ((node.data as any).dimmed) return
    setSelectedNode(node)

    // Highlight connected edges — panning still works (we don't lock it)
    const cfg = NODE_CFG[(node.data as any).nodeType]
    setEdges(es => es.map(e => ({
      ...e,
      animated: e.source === node.id || e.target === node.id,
      style: {
        stroke: e.source === node.id || e.target === node.id
          ? (cfg?.color ?? '#7974C3')
          : 'rgba(121,116,195,0.06)',
        strokeWidth: e.source === node.id || e.target === node.id ? 2.5 : 1,
      },
    })))

    // Zoom to clicked node + neighbors
    const neighborIds = new Set<string>([node.id])
    allEdges.forEach(e => {
      if (e.source === node.id) neighborIds.add(e.target)
      if (e.target === node.id) neighborIds.add(e.source)
    })
    const neighborNodes = allNodes.filter(n => neighborIds.has(n.id))
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 600, nodes: neighborNodes.length > 0 ? neighborNodes : [node] })
    }, 50)
  }, [allEdges, allNodes])

  const clearSelection = () => {
    setSelectedNode(null)
    // Restore edges
    setEdges(es => es.map(e => ({
      ...e, animated: false,
      style: { stroke: 'rgba(121,116,195,0.18)', strokeWidth: 1.5 },
    })))
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{ flexShrink: 0, padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--sidebar)' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--grad-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 4px 16px var(--violet-glow)', flexShrink: 0 }}>🕸️</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text1)', lineHeight: 1.3 }}>Knowledge Graph Explorer</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>ISO 15926 Part 2 · Equipment → Work Orders → Inspections → Standards</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 12, padding: '9px 14px', minWidth: 280, flex: '0 0 auto' }}>
            {searching ? <Spinner size={13} /> : <Search size={14} style={{ color: 'var(--text3)', flexShrink: 0 }} />}
            <input ref={searchInputRef} value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search nodes — press Enter to zoom"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text1)', fontFamily: 'inherit' }} />
            {query && (
              <button onClick={clearSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', padding: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Stat pills + filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: `${stats?.total_nodes ?? 0} nodes`, active: false, onClick: undefined },
            { label: `${stats?.total_edges ?? 0} edges`, active: false, onClick: undefined },
          ].map(({ label }) => (
            <span key={label} style={{ fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              {label}
            </span>
          ))}

          {Object.entries(NODE_CFG).map(([key, cfg]) => {
            const count = stats?.node_types?.[key] ?? 0
            if (count === 0) return null
            const active = filterType === key
            return (
              <button key={key} onClick={() => { setFilterType(active ? 'all' : key); setFocusedIds(null); setSearchResults([]) }} style={{
                fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 10, cursor: 'pointer',
                background: active ? `${cfg.color}22` : 'var(--card)',
                border: `1px solid ${active ? cfg.color + '66' : 'var(--border)'}`,
                color: active ? cfg.color : 'var(--text2)', transition: 'all 0.15s', fontFamily: 'inherit',
              }}>
                {cfg.label}: {count}
              </button>
            )
          })}

          {focusedIds && (
            <>
              <span style={{ fontSize: 12, padding: '6px 12px', borderRadius: 10, background: 'var(--violet-dim)', border: '1px solid var(--violet-border)', color: 'var(--violet)' }}>
                Focus: {focusedIds.size} nodes
              </span>
              <button onClick={expandNeighbors} style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--violet-border)', color: 'var(--violet)', cursor: 'pointer', fontFamily: 'inherit' }}>
                ＋ Expand
              </button>
              <button onClick={clearSearch} style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit' }}>
                Show all
              </button>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={() => fitView({ padding: 0.1, duration: 400 })} title="Fit view" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              <Maximize2 size={14} />
            </button>
            <button onClick={loadGraph} title="Reload graph" style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              {loading ? <Spinner size={13} /> : <RefreshCw size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 10 }}>
            <Spinner size={36} />
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>Loading knowledge graph…</span>
          </div>
        )}
        {!loading && nodes.length === 0 ? (
          <EmptyState icon="🕸️" title="Knowledge graph is empty"
            subtitle="Upload and ingest documents to auto-build the graph. Equipment tags, standards, and work orders are extracted automatically." />
        ) : (
          <ReactFlow
            nodes={nodes} edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNC}
            onEdgesChange={onEC}
            onNodeClick={handleNodeClick}
            onPaneClick={clearSelection}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.04}
            maxZoom={3}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            panOnScroll={false}
            panOnDrag={true}
            preventScrolling={true}
            style={{ background: 'var(--bg)' }}
            proOptions={{ hideAttribution: false }}
          >
            <Background color="var(--border)" gap={32} size={1} />
            <Controls
              showInteractive={true}
              style={{
                background: 'var(--card)', border: '1px solid var(--border2)',
                borderRadius: 12, overflow: 'hidden',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
              }}
            />
            <MiniMap
              nodeColor={n => NODE_CFG[(n.data as any).nodeType]?.color ?? 'var(--text3)'}
              style={{ background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 12 }}
              maskColor="rgba(0,0,0,0.4)"
              nodeStrokeWidth={2}
            />
            {selectedNode && (
              <Panel position="top-right">
                <NodeDetail node={selectedNode} onClose={clearSelection} />
              </Panel>
            )}
          </ReactFlow>
        )}
      </div>

      {/* Bottom legend */}
      {nodes.length > 0 && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 20, padding: '10px 24px', borderTop: '1px solid var(--border)', background: 'var(--sidebar)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>ISO 15926 Part 2</span>
          {Object.entries(NODE_CFG).map(([key, cfg]) => (
            <button key={key} onClick={() => { setFilterType(filterType === key ? 'all' : key); setFocusedIds(null); setSearchResults([]) }} style={{
              display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 8px', borderRadius: 8,
              opacity: filterType === 'all' || filterType === key ? 1 : 0.3,
              transition: 'opacity 0.15s',
            }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: cfg.color }}>{cfg.label}</span>
            </button>
          ))}
          {searchResults.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--violet)', fontWeight: 600 }}>
              {searchResults.length} match{searchResults.length !== 1 ? 'es' : ''} found — drag canvas to pan
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  )
}
