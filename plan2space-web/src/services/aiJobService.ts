import { apiClient } from './api'

export async function enqueueVectorize(projectId: string, fileId: string): Promise<{ jobId: string }> {
  const { data } = await apiClient.post('/ai/vectorize', { projectId, fileId })
  return data
}

export function subscribeToJob(jobId: string, onUpdate: (status: string, progressPercent: number) => void): () => void {
  const socket = new WebSocket(`${window.location.origin.replace('http', 'ws')}/ws/job/${jobId}`)
  socket.onmessage = (event) => {
    try {
      const { status, progressPercent } = JSON.parse(event.data)
      onUpdate(status, progressPercent)
    } catch {
      // ignore malformed frame
    }
  }
  return () => socket.close()
}
