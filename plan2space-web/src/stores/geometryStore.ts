import { create } from 'zustand'
import { fetchGeometry, saveGeometry, GeometryDto, Wall, Room, Opening, Point } from '../services/geometryService'

export interface GeometryState {
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  version: number
  loadFromServer: (projectId: string) => Promise<void>
  applyAiResult: (dto: GeometryDto) => void
  updateWall: (wallId: string, points: Point[]) => void
  addOpening: (opening: Opening) => void
  saveToServer: (projectId: string) => Promise<void>
}

export const useGeometryStore = create<GeometryState>((set, get) => ({
  walls: [],
  rooms: [],
  openings: [],
  version: 0,

  loadFromServer: async (projectId) => {
    const dto = await fetchGeometry(projectId)
    const maxVersion = dto.version ?? [...dto.walls, ...dto.rooms, ...dto.openings].reduce((m, e) => Math.max(m, e.version || 0), 0)
    set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings, version: maxVersion })
  },

  applyAiResult: (dto) => set({ walls: dto.walls, rooms: dto.rooms, openings: dto.openings }),

  updateWall: (wallId, points) =>
    set((state) => ({
      walls: state.walls.map((w) => (w.id === wallId ? { ...w, points } : w))
    })),

  addOpening: (opening) => set((state) => ({ openings: [...state.openings, opening] })),

  saveToServer: async (projectId) => {
    const { walls, rooms, openings, version } = get()
    const result = await saveGeometry(projectId, version, {
      walls: walls.map((w) => ({ id: w.id, points: w.points, thicknessMeters: w.thicknessMeters, heightMeters: w.heightMeters })),
      rooms: rooms.map((r) => ({ id: r.id, points: r.points, label: r.label })),
      openings: openings.map((o) => ({ id: o.id, wallId: o.wallId, type: o.type, position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters }))
    })
    set({ version: result.version })
  }
}))
