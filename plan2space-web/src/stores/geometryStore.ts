import { create } from 'zustand'
import { deriveRooms, fetchGeometry, saveGeometry, FurnitureItem, GeometryDto, Wall, Room, Opening, Point } from '../services/geometryService'
import {
  alongClamped, DEFAULT_WALL_HEIGHT_M, DEFAULT_WALL_THICKNESS_M, distanceAlong, interiorPoint, newId, pointInPolygon,
} from '../lib/planGeometry'
import { roomTypeOf } from '../lib/roomTypes'

// What a calibration puts back if its save fails: the plan and whether it had unsaved edits.
export interface PlanSnapshot {
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  furniture: FurnitureItem[]
  dirty: boolean
  wallsEdited: boolean
}

export interface GeometryState {
  projectId: string | null
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  furniture: FurnitureItem[]
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
  addFurniture: (item: Omit<FurnitureItem, 'id'>) => string
  moveFurniture: (id: string, x: number, y: number) => void
  rotateFurniture: (id: string, deltaDeg: number) => void
  deleteFurniture: (id: string) => void
  flipDoorSwing: (openingId: string) => void
  replaceFurnitureInRoom: (room: Point[], items: Omit<FurnitureItem, 'id'>[]) => void
  updateRoomLabel: (roomId: string, label: string) => void
  setRoomWallColor: (roomId: string, color: string | null) => void
  scalePlan: (factor: number) => void
  snapshotPlan: () => PlanSnapshot
  restorePlan: (snapshot: PlanSnapshot) => void
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
  // Absent in drafts written before these fields existed.
  furniture?: FurnitureItem[]
  wallsEdited?: boolean
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
  // Bumped by every edit, so a save can tell whether the plan changed while it was in flight.
  let editSeq = 0
  const markEdited = () => {
    editSeq++
    const { projectId, version, walls, rooms, openings, furniture, wallsEdited } = get()
    set({ dirty: true })
    writeDraft(projectId, { version, walls, rooms, openings, furniture, wallsEdited })
  }

  return {
    projectId: null,
    walls: [],
    rooms: [],
    openings: [],
    furniture: [],
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
        set({ projectId, walls: draft.walls, rooms: draft.rooms, openings: draft.openings, furniture: draft.furniture ?? [],
              version, saveConflict: false, dirty: true, draftDiscarded: false, wallsEdited: draft.wallsEdited ?? true,
              roomsRefreshFailed: false })
        return
      }
      clearDraft(projectId)
      set({ projectId, walls: dto.walls, rooms: dto.rooms, openings: dto.openings, furniture: dto.furniture ?? [], version,
            saveConflict: false, dirty: false, draftDiscarded: draft !== null, wallsEdited: false, roomsRefreshFailed: false })
    },

    applyAiResult: (dto) => {
      set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings, furniture: dto.furniture ?? [] })
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

    addFurniture: (item) => {
      const id = newId()
      set((state) => ({ furniture: [...state.furniture, { ...item, id }] }))
      markEdited()
      return id
    },

    flipDoorSwing: (openingId) => {
      set((state) => ({ openings: state.openings.map((o) => (o.id === openingId ? { ...o, swingFlipped: !o.swingFlipped } : o)) }))
      markEdited()
    },

    moveFurniture: (id, x, y) => {
      set((state) => ({ furniture: state.furniture.map((f) => (f.id === id ? { ...f, x, y } : f)) }))
      markEdited()
    },

    rotateFurniture: (id, deltaDeg) => {
      set((state) => ({ furniture: state.furniture.map((f) =>
        f.id === id ? { ...f, rotationDeg: (((f.rotationDeg + deltaDeg) % 360) + 360) % 360 } : f) }))
      markEdited()
    },

    deleteFurniture: (id) => {
      set((state) => ({ furniture: state.furniture.filter((f) => f.id !== id) }))
      markEdited()
    },

    replaceFurnitureInRoom: (room, items) => {
      set((state) => ({ furniture: [
        ...state.furniture.filter((f) => !pointInPolygon({ x: f.x, y: f.y }, room)),
        ...items.map((i) => ({ ...i, id: newId() })),
      ] }))
      markEdited()
    },

    setRoomWallColor: (roomId, color) => {
      set((state) => ({ rooms: state.rooms.map((r) => (r.id !== roomId ? r
        : color ? { ...r, wallColor: color } : (({ wallColor, ...rest }) => rest)(r))) }))
      markEdited()
    },

    updateRoomLabel: (roomId, label) => {
      set((state) => ({ rooms: state.rooms.map((r) => (r.id === roomId ? { ...r, label } : r)) }))
      markEdited()
    },

    snapshotPlan: () => {
      const { walls, rooms, openings, furniture, dirty, wallsEdited } = get()
      return { walls, rooms, openings, furniture, dirty, wallsEdited }
    },

    restorePlan: (snapshot) => {
      editSeq++
      set({ walls: snapshot.walls, rooms: snapshot.rooms, openings: snapshot.openings, furniture: snapshot.furniture,
            dirty: snapshot.dirty, wallsEdited: snapshot.wallsEdited })
      const { projectId, version } = get()
      // The draft mirrors the restored plan: unsaved edits keep theirs, a clean plan has none.
      if (snapshot.dirty) {
        writeDraft(projectId, { version, walls: snapshot.walls, rooms: snapshot.rooms, openings: snapshot.openings,
                                furniture: snapshot.furniture, wallsEdited: snapshot.wallsEdited })
      } else {
        clearDraft(projectId)
      }
    },

    scalePlan: (factor) => {
      // Calibration corrects measurements, not sizes: thickness, height, opening widths and furniture are real-world.
      const scale = (p: Point) => ({ x: p.x * factor, y: p.y * factor })
      set((state) => ({
        walls: state.walls.map((w) => ({ ...w, points: w.points.map(scale) })),
        rooms: state.rooms.map((r) => ({ ...r, points: r.points.map(scale) })),
        openings: state.openings.map((o) => ({ ...o, position: scale(o.position) })),
        furniture: state.furniture.map((f) => ({ ...f, x: f.x * factor, y: f.y * factor })),
      }))
      markEdited()
    },

    saveToServer: async (projectId) => {
      // Save exactly what the user saw when they pressed Save: edits made while the rooms are derived or
      // the PUT is in flight are not in this save, so they must stay unsaved (dirty, with their draft).
      const seq = editSeq
      const { walls, openings, furniture, version, wallsEdited } = get()
      let rooms = get().rooms
      let roomsRefreshFailed = false
      if (wallsEdited) {
        try {
          const derived = await deriveRooms(walls)
          if (!Array.isArray(derived)) throw new Error('No rooms returned')
          const previous = rooms
          rooms = derived.map((r) => {
            // A re-derived room keeps the type and the wall paint the user gave the room it replaces. Automatic
            // "Room N" names are not carried over: a room split in two would otherwise yield two rooms of that name.
            const probe = interiorPoint(r.points)
            const before = previous.find((old) => pointInPolygon(probe, old.points))
            const label = before && roomTypeOf(before.label) ? before.label : r.label
            return { id: newId(), points: r.points, label, version: 0, ...(before?.wallColor ? { wallColor: before.wallColor } : {}) }
          })
        } catch {
          // The walls still save; the previous rooms stay until a later save derives them again.
          roomsRefreshFailed = true
        }
      }
      try {
        const result = await saveGeometry(projectId, version, {
          walls: walls.map((w) => ({ id: w.id, points: w.points, thicknessMeters: w.thicknessMeters, heightMeters: w.heightMeters })),
          rooms: rooms.map((r) => ({ id: r.id, points: r.points, label: r.label, wallColor: r.wallColor ?? null })),
          openings: openings.map((o) => ({ id: o.id, wallId: o.wallId, type: o.type, position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters, swingFlipped: !!o.swingFlipped })),
          furniture: furniture.map((f) => ({ id: f.id, catalogId: f.catalogId, x: f.x, y: f.y, rotationDeg: f.rotationDeg })),
        })
        if (editSeq === seq) {
          clearDraft(projectId)
          set({ rooms, version: result.version, saveConflict: false, dirty: false,
                wallsEdited: roomsRefreshFailed, roomsRefreshFailed })
          return
        }
        // The plan changed during the save: keep the newer edits on top of the saved version. The rooms
        // were derived from the older walls, so the next save derives them again.
        set({ version: result.version, saveConflict: false, dirty: true, wallsEdited: true, roomsRefreshFailed })
        const current = get()
        writeDraft(projectId, { version: result.version, walls: current.walls, rooms: current.rooms,
                                openings: current.openings, furniture: current.furniture, wallsEdited: true })
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
