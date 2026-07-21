import axios from 'axios'
import type { Document, Source, ChatMessage, GraphStats, GraphNode, GraphEdge, RCAResult, ComplianceResult, PermitResult, UploadResult } from '../types'

const api = axios.create({ baseURL: '/api/v1', timeout: 120_000 })

// documents
export const uploadDocument = (file: File, docType: string, plantId: string) => {
  const form = new FormData()
  form.append('file', file)
  form.append('doc_type', docType)
  form.append('plant_id', plantId)
  return api.post<UploadResult>('/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
export const getDocuments    = (plantId: string) => api.get<Document[]>('/documents', { params: { plant_id: plantId } })
export const deleteDocument  = (docId: string)   => api.delete(`/documents/${docId}`)
export const clearAllDocs    = (plantId: string)  => api.delete('/documents/clear/all', { params: { plant_id: plantId } })

// chat
export const sendChat = (query: string, sessionId: string | null, plantId: string, forceAgent?: string) =>
  api.post<{ session_id: string; answer: string; sources: Source[]; agent: string }>(
    '/chat', { query, session_id: sessionId, plant_id: plantId, force_agent: forceAgent }
  )

// agents
export const runRca = (equipmentId: string, symptom: string, plantId: string) =>
  api.post<RCAResult>('/rca', { equipment_id: equipmentId, symptom, plant_id: plantId })

export const runCompliance = (standard: string, plantId: string) =>
  api.post<ComplianceResult>('/compliance', { standard, plant_id: plantId })

export const generatePermit = (equipmentId: string, workType: string, location: string, plantId: string) =>
  api.post<PermitResult>('/permit', { equipment_id: equipmentId, work_type: workType, location, plant_id: plantId })

// pdf
const pdfConfig = {
  responseType: 'blob' as const,
  headers: { 'Accept': 'application/pdf' },
}
export const rcaPdf        = (eq: string, sym: string, pid: string) => api.post('/rca/pdf', { equipment_id: eq, symptom: sym, plant_id: pid }, pdfConfig)
export const permitPdf     = (eq: string, wt: string, loc: string, pid: string) => api.post('/permit/pdf', { equipment_id: eq, work_type: wt, location: loc, plant_id: pid }, pdfConfig)
export const compliancePdf = (std: string, pid: string) => api.post('/compliance/pdf', { standard: std, plant_id: pid }, pdfConfig)

// graph
export const getGraphStats  = () => api.get<GraphStats>('/graph/stats')
export const getGraphFull   = (plantId: string) => api.get<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/graph/full', { params: { plant_id: plantId } })
export const searchGraphApi = (query: string, plantId: string) => api.get<{ nodes: GraphNode[] }>('/graph/search', { params: { query, plant_id: plantId } })

// health
export const getHealth = () => api.get('/health')

export const downloadBlob = (blob: Blob, filename: string) => {
  // Force correct MIME type for PDFs
  const pdfBlob = filename.endsWith('.pdf')
    ? new Blob([blob], { type: 'application/pdf' })
    : blob
  const url = URL.createObjectURL(pdfBlob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  // Small delay before revoking so browser can initiate download
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}
