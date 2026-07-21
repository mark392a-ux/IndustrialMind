export interface Document {
  id: string
  filename: string
  doc_type: string
  page_count: number
  chunk_count: number
  status: 'pending' | 'processing' | 'indexed' | 'failed'
  plant_id: string
  created_at: string
}

export interface Source {
  filename: string
  page: number
  doc_type: string
  score: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  agent?: string
}

export interface GraphStats {
  total_nodes: number
  total_edges: number
  node_types: Record<string, number>
}

export interface GraphNode {
  id: string
  data: { label: string }
  style?: Record<string, string>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface RCAResult {
  answer: string
  sources: Source[]
  agent: string
  equipment_id: string
  symptom: string
}

export interface ComplianceResult {
  answer: string
  sources: Source[]
  agent: string
  standard: string
}

export interface PermitResult {
  permit_content: string
  sources: Source[]
  equipment_id: string
  work_type: string
  location: string
}

export interface UploadResult {
  doc_id: string
  filename: string
  page_count: number
  chunk_count: number
  entities_extracted: number
  status: string
}
