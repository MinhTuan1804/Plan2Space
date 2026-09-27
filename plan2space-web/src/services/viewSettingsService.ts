import { apiClient } from './api'

// Plan coordinates [x, y, height above the ground floor], metres.
export type Vec3 = [number, number, number]
export interface SavedView { name: string; level: number; position: Vec3; target: Vec3 }
// How a project is presented: where the house stands, which way north is (clockwise from plan +y), saved views.
export interface ViewSettings { location: { lat: number; lon: number }; northDeg: number; views: SavedView[] }

export const DEFAULT_VIEW_SETTINGS: ViewSettings = { location: { lat: 10.776, lon: 106.7 }, northDeg: 0, views: [] }

export async function fetchViewSettings(projectId: string): Promise<ViewSettings> {
  const { data } = await apiClient.get(`/projects/${projectId}/view-settings`)
  return data
}

export async function saveViewSettings(projectId: string, settings: ViewSettings): Promise<void> {
  await apiClient.put(`/projects/${projectId}/view-settings`, settings)
}
