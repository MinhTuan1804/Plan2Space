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

export interface GeometryDto {
  walls: Wall[]
  rooms: Room[]
  openings: Opening[]
  version?: number
}

export async function fetchGeometry(projectId: string): Promise<GeometryDto> {
  const { data } = await apiClient.get(`/projects/${projectId}/geometry`)
  return data
}

export async function saveGeometry(
  projectId: string,
  baseVersion: number,
  payload: {
    walls: { id?: string; points: Point[]; thicknessMeters: number; heightMeters: number }[]
    rooms: { id?: string; points: Point[]; label: string }[]
    openings: { id?: string; wallId: string; type: string; position: Point; widthMeters: number; sillHeightMeters: number }[]
  }
): Promise<{ version: number }> {
  const { data } = await apiClient.put(`/projects/${projectId}/geometry`, { baseVersion, ...payload })
  return data
}
