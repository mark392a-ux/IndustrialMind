import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Document } from '../types'

export type Tab = 'copilot' | 'rca' | 'compliance' | 'permit' | 'graph' | 'documents' | 'roi'
export type Theme = 'dark' | 'light'

export interface Preset {
  tab: Tab
  data?: Record<string, string | undefined>
}

export interface ActivityItem {
  id: string
  icon: string
  text: string
  sub: string
  time: string
}

interface Store {
  plantId:      string
  setPlantId:   (id: string) => void
  backendOk:    boolean
  setBackendOk: (ok: boolean) => void
  theme:        Theme
  toggleTheme:  () => void
  activeTab:    Tab
  setActiveTab: (tab: Tab) => void
  documents:    Document[]
  setDocuments: (docs: Document[]) => void
  addDocument:  (doc: Document) => void
  removeDocument:(id: string) => void
  clearDocuments:() => void
  sessionId:    string | null
  setSessionId: (id: string | null) => void
  preset:       Preset | null
  setPreset:    (p: Preset) => void
  clearPreset:  () => void
  // AI activity log
  activities:   ActivityItem[]
  addActivity:  (item: Omit<ActivityItem,'id'|'time'>) => void
  clearActivities:() => void
  // top sources
  topSources:   Array<{filename:string; page:number; score:number}>
  setTopSources:(s: Array<{filename:string; page:number; score:number}>) => void
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      plantId:       'plant_001',
      setPlantId:    (id) => set({ plantId: id }),
      backendOk:     false,
      setBackendOk:  (ok) => set({ backendOk: ok }),
      theme:         'dark',
      toggleTheme:   () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        document.documentElement.className = next
      },
      activeTab:     'copilot',
      setActiveTab:  (tab) => set({ activeTab: tab }),
      documents:     [],
      setDocuments:  (docs) => set({ documents: docs }),
      addDocument:   (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
      removeDocument:(id) => set((s) => ({ documents: s.documents.filter(d => d.id !== id) })),
      clearDocuments:() => set({ documents: [] }),
      sessionId:     null,
      setSessionId:  (id) => set({ sessionId: id }),
      preset:        null,
      setPreset:     (p) => set({ preset: p }),
      clearPreset:   () => set({ preset: null }),
      activities:    [],
      addActivity:   (item) => set((s) => ({
        activities: [{
          ...item,
          id: Math.random().toString(36).slice(2),
          time: new Date().toLocaleTimeString('en', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
        }, ...s.activities].slice(0, 20)
      })),
      clearActivities: () => set({ activities: [] }),
      topSources:    [],
      setTopSources: (s) => set({ topSources: s }),
    }),
    { name: 'im-store', partialize: (s) => ({ theme: s.theme, plantId: s.plantId }) }
  )
)
