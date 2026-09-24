import { apiClient } from './api'

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'ifc' | 'pdf'

export const EXPORT_OPTIONS: { format: ExportFormat; label: string }[] = [
  { format: 'glb', label: '3D model (GLB)' },
  { format: 'gltf', label: '3D model (glTF)' },
  { format: 'obj', label: '3D model (OBJ)' },
  { format: 'ifc', label: 'BIM model (IFC)' },
  { format: 'pdf', label: 'Report + BOQ (PDF)' },
]

function fileNameFrom(disposition: string | undefined, fallback: string): string {
  const match = disposition?.match(/filename="?([^";]+)"?/i)
  return match ? match[1] : fallback
}

// POST /api/export/{projectId}?format=… returns the file; save it through a temporary object URL.
export async function downloadExport(projectId: string, format: ExportFormat): Promise<string> {
  try {
    const response = await apiClient.post(`/export/${projectId}?format=${format}`, null, { responseType: 'blob' })
    const fileName = fileNameFrom(response.headers?.['content-disposition'], `plan2space.${format}`)
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    return fileName
  } catch (err: any) {
    // With responseType 'blob' the JSON error body arrives as a Blob too.
    const body = err?.response?.data
    const message = body instanceof Blob ? await messageFromJsonBlob(body) : body?.message
    throw new Error(message || 'Export failed. Please try again.')
  }
}

function messageFromJsonBlob(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result))?.message)
      } catch {
        resolve(undefined)
      }
    }
    reader.onerror = () => resolve(undefined)
    reader.readAsText(blob)
  })
}
