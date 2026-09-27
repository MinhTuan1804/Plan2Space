import { create } from 'zustand'
import { DEFAULT_VIEW_SETTINGS, fetchViewSettings, saveViewSettings, ViewSettings } from '../services/viewSettingsService'

interface ViewSettingsState {
  projectId: string | null
  settings: ViewSettings
  saveError: string | null
  load: (projectId: string) => Promise<void>
  update: (patch: Partial<ViewSettings>) => Promise<void>
}

// Only the newest save may report back: an earlier one finishing late must not undo a newer change.
let latestSave = 0

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
    const mine = ++latestSave
    try {
      await saveViewSettings(projectId, settings)
      if (mine === latestSave) set({ saveError: null })
    } catch {
      if (mine === latestSave) set({ saveError: 'Không lưu được cài đặt xem' })
    }
  },
}))
