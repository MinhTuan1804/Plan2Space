import { apiClient } from './api'

export interface Point {
  x: number
  y: number
}

export interface Wall {
  id: string
  points: Point[]
  thicknessMeters: number
  heightMeters: number
  version: number
  level?: number              // storey, 0 = ground floor
}

export interface Room {
  id: string
  points: Point[]
  label: string
  version: number
  wallColor?: string          // #RRGGBB paint of the wall faces inside this room
  level?: number
}

export interface Opening {
  id: string
  wallId: string
  type: 'Door' | 'Window'
  position: Point
  widthMeters: number
  sillHeightMeters: number
  version: number
  swingFlipped?: boolean      // the door swings the other way than the automatic choice
  level?: number
  doorStyle?: 'standard' | 'garage' | null   // null: chosen automatically
}

// Absolute plan position; the item's front faces local -y at rotation 0 (CCW degrees).
export interface FurnitureItem {
  id: string
  catalogId: string
  x: number
  y: number
  rotationDeg: number
  level?: number
}

export interface GeometryDto {
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  furniture?: FurnitureItem[]
  version?: number
}

export async function fetchGeometry(projectId: string): Promise<GeometryDto> {
  const { data } = await apiClient.get(`/projects/${projectId}/geometry`)
  return data
}

// Rooms are derived from the wall graph by the same code the import uses (ai-service, via the API).
export async function deriveRooms(walls: Wall[]): Promise<{ points: Point[]; label: string }[]> {
  const { data } = await apiClient.post('/rooms/derive', { walls: walls.map((w) => ({ points: w.points })) })
  return data.rooms
}

export async function saveGeometry(
  projectId: string,
  baseVersion: number,
  payload: {
    walls: { id?: string; points: Point[]; thicknessMeters: number; heightMeters: number; level?: number }[]
    rooms: { id?: string; points: Point[]; label: string; wallColor?: string | null; level?: number }[]
    openings: { id?: string; wallId: string; type: string; position: Point; widthMeters: number; sillHeightMeters: number; swingFlipped?: boolean; level?: number; doorStyle?: 'standard' | 'garage' | null }[]
    furniture: { id?: string; catalogId: string; x: number; y: number; rotationDeg: number; level?: number }[]
  }
): Promise<{ version: number }> {
  const { data } = await apiClient.put(`/projects/${projectId}/geometry`, { baseVersion, ...payload })
  return data
}
