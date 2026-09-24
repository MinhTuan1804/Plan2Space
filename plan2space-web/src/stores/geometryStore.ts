import { create } from 'zustand'
import { fetchGeometry, saveGeometry, GeometryDto, Wall, Room, Opening, Point } from '../services/geometryService'

export interface GeometryState {
  projectId: string | null
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  version: number
  saveConflict: boolean
  // Local edits not yet saved to the server (mirrored to a localStorage draft).
  dirty: boolean
  // A draft from an earlier session was dropped because the server plan had changed since.
  draftDiscarded: boolean
  loadFromServer: (projectId: string) => Promise<void>
  applyAiResult: (dto: GeometryDto) => void
  updateWall: (wallId: string, points: Point[]) => void
  addOpening: (opening: Opening) => void
  saveToServer: (projectId: string) => Promise<void>
}

interface Draft {
  version: number
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
}

// Unsaved edits survive a reload, a closed tab or a forced re-login (expired token).
export const draftKey = (projectId: string) => `p2s-draft:${projectId}`

function readDraft(projectId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(projectId))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function writeDraft(projectId: string | null, draft: Draft) {
  if (!projectId) return
  try {
    localStorage.setItem(draftKey(projectId), JSON.stringify(draft))
  } catch {
    // storage full / unavailable: the beforeunload warning still protects the edits
  }
}

function clearDraft(projectId: string | null) {
  if (!projectId) return
  try {
    localStorage.removeItem(draftKey(projectId))
  } catch {
    // ignore
  }
}

export const useGeometryStore = create<GeometryState>((set, get) => {
  const markEdited = () => {
    const { projectId, version, walls, rooms, openings } = get()
    set({ dirty: true })
    writeDraft(projectId, { version, walls, rooms, openings })
  }

  return {
    projectId: null,
    walls: [],
    rooms: [],
    openings: [],
    version: 0,
    saveConflict: false,
    dirty: false,
    draftDiscarded: false,

    loadFromServer: async (projectId) => {
      const dto = await fetchGeometry(projectId)
      const version = dto.version ?? [...dto.walls, ...dto.rooms, ...dto.openings].reduce((m, e) => Math.max(m, e.version || 0), 0)
      const draft = readDraft(projectId)
      if (draft && draft.version === version) {
        // Nobody saved since these edits were made: pick them back up.
        set({ projectId, walls: draft.walls, rooms: draft.rooms, openings: draft.openings, version,
              saveConflict: false, dirty: true, draftDiscarded: false })
        return
      }
      clearDraft(projectId)
      set({ projectId, walls: dto.walls, rooms: dto.rooms, openings: dto.openings, version,
            saveConflict: false, dirty: false, draftDiscarded: draft !== null })
    },

    applyAiResult: (dto) => {
      set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings })
      markEdited()
    },

    updateWall: (wallId, points) => {
      set((state) => ({ walls: state.walls.map((w) => (w.id === wallId ? { ...w, points } : w)) }))
      markEdited()
    },

    addOpening: (opening) => {
      set((state) => ({ openings: [...state.openings, opening] }))
      markEdited()
    },

    saveToServer: async (projectId) => {
      const { walls, rooms, openings, version } = get()
      try {
        const result = await saveGeometry(projectId, version, {
          walls: walls.map((w) => ({ id: w.id, points: w.points, thicknessMeters: w.thicknessMeters, heightMeters: w.heightMeters })),
          rooms: rooms.map((r) => ({ id: r.id, points: r.points, label: r.label })),
          openings: openings.map((o) => ({ id: o.id, wallId: o.wallId, type: o.type, position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters }))
        })
        clearDraft(projectId)
        set({ version: result.version, saveConflict: false, dirty: false })
      } catch (err: any) {
        if (err?.response?.status === 409) {
          set({ saveConflict: true })
          return
        }
        throw err
      }
    }
  }
})
