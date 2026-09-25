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
}

export interface Room {
  id: string
  points: Point[]
  label: string
  version: number
}

export interface Opening {
  id: string
  wallId: string
  type: 'Door' | 'Window'
  position: Point
  widthMeters: number
  sillHeightMeters: number
  version: number
}

// Absolute plan position; the item's front faces local -y at rotation 0 (CCW degrees).
export interface FurnitureItem {
  id: string
  catalogId: string
  x: number
  y: number
  rotationDeg: number
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
    walls: { id?: string; points: Point[]; thicknessMeters: number; heightMeters: number }[]
    rooms: { id?: string; points: Point[]; label: string }[]
    openings: { id?: string; wallId: string; type: string; position: Point; widthMeters: number; sillHeightMeters: number }[]
    furniture: { id?: string; catalogId: string; x: number; y: number; rotationDeg: number }[]
  }
): Promise<{ version: number }> {
  const { data } = await apiClient.put(`/projects/${projectId}/geometry`, { baseVersion, ...payload })
  return data
}
