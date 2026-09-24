import { create } from 'zustand'
import { fetchGeometry, saveGeometry, GeometryDto, Wall, Room, Opening, Point } from '../services/geometryService'
import { alongClamped, DEFAULT_WALL_HEIGHT_M, DEFAULT_WALL_THICKNESS_M, distanceAlong, newId } from '../lib/planGeometry'

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
  addWall: (points: Point[]) => string
  deleteWall: (wallId: string) => void
  moveWallPoint: (wallId: string, index: number, point: Point) => void
  updateOpening: (openingId: string, patch: Partial<Pick<Opening, 'position' | 'widthMeters' | 'type'>>) => void
  deleteOpening: (openingId: string) => void
  // Walls changed since the last save, so the rooms must be derived again before saving.
  wallsEdited: boolean
  // The last save could not re-derive rooms and kept the previous ones.
  roomsRefreshFailed: boolean
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

// A wall that moves or changes length keeps its openings on it, each at the same distance from its start.
function carryOpenings(openings: Opening[], before: Wall | undefined, after: Wall): Opening[] {
  if (!before) return openings
  return openings.map((o) => o.wallId !== after.id ? o : {
    ...o, position: alongClamped(after.points, distanceAlong(before.points, o.position), o.widthMeters),
  })
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
    wallsEdited: false,
    roomsRefreshFailed: false,

    loadFromServer: async (projectId) => {
      const dto = await fetchGeometry(projectId)
      const version = dto.version ?? [...dto.walls, ...dto.rooms, ...dto.openings].reduce((m, e) => Math.max(m, e.version || 0), 0)
      const draft = readDraft(projectId)
      if (draft && draft.version === version) {
        // Nobody saved since these edits were made: pick them back up.
        set({ projectId, walls: draft.walls, rooms: draft.rooms, openings: draft.openings, version,
              saveConflict: false, dirty: true, draftDiscarded: false, wallsEdited: false, roomsRefreshFailed: false })
        return
      }
      clearDraft(projectId)
      set({ projectId, walls: dto.walls, rooms: dto.rooms, openings: dto.openings, version,
            saveConflict: false, dirty: false, draftDiscarded: draft !== null, wallsEdited: false, roomsRefreshFailed: false })
    },

    applyAiResult: (dto) => {
      set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings })
      markEdited()
    },

    updateWall: (wallId, points) => {
      set((state) => {
        const before = state.walls.find((w) => w.id === wallId)
        if (!before) return {}
        const after = { ...before, points }
        return {
          walls: state.walls.map((w) => (w.id === wallId ? after : w)),
          openings: carryOpenings(state.openings, before, after),
          wallsEdited: true,
        }
      })
      markEdited()
    },

    addOpening: (opening) => {
      set((state) => ({ openings: [...state.openings, opening] }))
      markEdited()
    },

    addWall: (points) => {
      const id = newId()
      set((state) => ({
        walls: [...state.walls, { id, points, thicknessMeters: DEFAULT_WALL_THICKNESS_M, heightMeters: DEFAULT_WALL_HEIGHT_M, version: 0 }],
        wallsEdited: true,
      }))
      markEdited()
      return id
    },

    deleteWall: (wallId) => {
      // An opening cannot outlive its wall: the API rejects a save that references a missing wall.
      set((state) => ({
        walls: state.walls.filter((w) => w.id !== wallId),
        openings: state.openings.filter((o) => o.wallId !== wallId),
        wallsEdited: true,
      }))
      markEdited()
    },

    moveWallPoint: (wallId, index, point) => {
      const wall = get().walls.find((w) => w.id === wallId)
      if (!wall) return
      get().updateWall(wallId, wall.points.map((p, i) => (i === index ? point : p)))
    },

    updateOpening: (openingId, patch) => {
      set((state) => ({ openings: state.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)) }))
      markEdited()
    },

    deleteOpening: (openingId) => {
      set((state) => ({ openings: state.openings.filter((o) => o.id !== openingId) }))
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
