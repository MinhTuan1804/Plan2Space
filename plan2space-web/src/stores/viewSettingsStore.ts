import { create } from 'zustand'
import { DEFAULT_VIEW_SETTINGS, fetchViewSettings, saveViewSettings, ViewSettings } from '../services/viewSettingsService'

interface ViewSettingsState {
  projectId: string | null
  settings: ViewSettings
  saveError: string | null
  load: (projectId: string) => Promise<void>
  update: (patch: Partial<ViewSettings>) => Promise<void>
}

// One save at a time, always of the newest settings: parallel PUTs could land out of order and leave an older
// value on the server. Changes made while a save is out wait, and only the latest of them is sent.
let queued: { projectId: string; settings: ViewSettings } | null = null
let saving: Promise<void> | null = null

export const useViewSettingsStore = create<ViewSettingsState>((set, get) => ({
  projectId: null,
  settings: DEFAULT_VIEW_SETTINGS,
  saveError: null,
  load: async (projectId) => {
    set({ projectId, settings: DEFAULT_VIEW_SETTINGS, saveError: null })
    try {
      const settings = await fetchViewSettings(projectId)
      if (get().projectId === projectId) set({ settings })
    } catch {
      // Defaults stand in; the page works without saved settings.
    }
  },
  update: async (patch) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    const projectId = get().projectId
    if (!projectId) return
    queued = { projectId, settings }
    saving ??= (async () => {
      let error: string | null = null
      while (queued) {
        const next = queued
        queued = null
        try {
          await saveViewSettings(next.projectId, next.settings)
          error = null
        } catch {
          error = 'Không lưu được cài đặt xem'
        }
      }
      saving = null
      set({ saveError: error })
    })()
    return saving
  },
}))
