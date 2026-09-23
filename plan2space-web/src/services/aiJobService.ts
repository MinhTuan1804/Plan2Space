import { apiClient } from './api'
import { useAuthStore } from '../stores/authStore'

export interface JobStatus {
  status: string
  progressPercent: number
  error?: string | null
}

const TERMINAL = ['Completed', 'Failed']
const MAX_POLL_FAILURES = 5

export async function uploadProjectFile(projectId: string, file: File): Promise<{ fileId: string }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await apiClient.post(`/projects/${projectId}/files`, form)
  return data
}

export async function enqueueVectorize(projectId: string, fileId: string): Promise<{ jobId: string }> {
  const { data } = await apiClient.post('/ai/vectorize', { projectId, fileId })
  return data
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const { data } = await apiClient.get(`/ai/job/${jobId}/status`)
  return data
}

export function subscribeToJob(
  jobId: string,
  onUpdate: (status: string, progressPercent: number) => void,
  onClose?: () => void
): () => void {
  // Browsers cannot set an Authorization header on a WebSocket handshake; the API reads ?access_token=.
  const token = encodeURIComponent(useAuthStore.getState().accessToken ?? '')
  const origin = window.location.origin.replace(/^http/, 'ws')
  const socket = new WebSocket(`${origin}/ws/job/${jobId}?access_token=${token}`)
  socket.onmessage = (event) => {
    try {
      const { status, progressPercent } = JSON.parse(event.data)
      onUpdate(status, progressPercent)
    } catch {
      // ignore malformed frame
    }
  }
  if (onClose) socket.onclose = onClose
  return () => socket.close()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Upload a plan, start AI vectorization and wait for it to finish. Progress arrives over the
 * job WebSocket; if the socket drops mid-job, falls back to polling the status endpoint.
 * Rejects with the worker's error message when the job fails.
 */
export async function runVectorization(
  projectId: string,
  file: File,
  onProgress: (status: string, progressPercent: number) => void,
  options: { pollIntervalMs?: number } = {}
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 2000
  const { fileId } = await uploadProjectFile(projectId, file)
  const { jobId } = await enqueueVectorize(projectId, fileId)

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let unsubscribe: () => void = () => {}

    const finish = async (status: string) => {
      if (settled) return
      settled = true
      unsubscribe()
      if (status === 'Completed') return resolve()
      try {
        const detail = await getJobStatus(jobId)
        reject(new Error(detail.error || 'AI vectorization failed'))
      } catch {
        reject(new Error('AI vectorization failed'))
      }
    }

    const poll = async () => {
      let failures = 0
      while (!settled) {
        await sleep(pollIntervalMs)
        try {
          const s = await getJobStatus(jobId)
          failures = 0
          onProgress(s.status, s.progressPercent)
          if (TERMINAL.includes(s.status)) return finish(s.status)
        } catch {
          if (++failures >= MAX_POLL_FAILURES) {
            settled = true
            return reject(new Error('Lost connection to the AI job'))
          }
        }
      }
    }

    unsubscribe = subscribeToJob(
      jobId,
      (status, pct) => {
        onProgress(status, pct)
        if (TERMINAL.includes(status)) void finish(status)
      },
      () => {
        if (!settled) void poll()
      }
    )
  })
}
