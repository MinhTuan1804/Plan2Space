import { apiClient } from './api'

export interface Underlay {
  fileId: string
  metresPerPixel: number
  widthPx: number
  heightPx: number
}

// 204 = the latest import has no image to show (a DXF or PDF, or nothing imported yet).
export async function fetchUnderlay(projectId: string): Promise<Underlay | null> {
  const res = await apiClient.get(`/projects/${projectId}/underlay`)
  return res.status === 204 ? null : res.data
}

// An <img> cannot send the bearer token, so the image is fetched as a blob and shown from an object URL.
export async function fetchFileObjectUrl(projectId: string, fileId: string): Promise<string> {
  const { data } = await apiClient.get(`/projects/${projectId}/files/${fileId}/content`, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

export async function setUnderlayScale(projectId: string, metresPerPixel: number): Promise<void> {
  await apiClient.put(`/projects/${projectId}/underlay`, { metresPerPixel })
}
