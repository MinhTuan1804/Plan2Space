import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '../src/services/api'
import { useAuthStore } from '../src/stores/authStore'
import { useGeometryStore } from '../src/stores/geometryStore'
import { subscribeToJob, runVectorization } from '../src/services/aiJobService'
import { StudioToolbar } from '../src/components/studio/StudioToolbar'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  closed = false
  constructor(public url: string) { FakeWebSocket.instances.push(this) }
  close() { this.closed = true }
  emit(status: string, progressPercent: number) { this.onmessage?.({ data: JSON.stringify({ status, progressPercent }) }) }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('AI import', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    useAuthStore.setState({ accessToken: 'tok 1' })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('authenticates the job WebSocket with the access token (browsers cannot send headers)', () => {
    subscribeToJob('j1', () => {})
    const url = FakeWebSocket.instances[0].url
    expect(url).toMatch(/^ws/)
    expect(url).toContain('/ws/job/j1?access_token=tok%201')
  })

  it('uploads, enqueues and resolves when the job completes, reporting progress', async () => {
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) =>
      url.endsWith('/files') ? { data: { fileId: 'f1' } } : { data: { jobId: 'j1' } })
    const progress: number[] = []
    const file = new File(['0\nSECTION'], 'plan.dxf')

    const done = runVectorization('p1', file, (_s, pct) => progress.push(pct))
    await flush(); await flush()
    const socket = FakeWebSocket.instances[0]
    socket.emit('Running', 40)
    socket.emit('Completed', 100)
    await done

    expect(post.mock.calls[0][0]).toBe('/projects/p1/files')
    expect(post.mock.calls[0][1]).toBeInstanceOf(FormData)
    expect(post.mock.calls[1]).toEqual(['/ai/vectorize', { projectId: 'p1', fileId: 'f1' }])
    expect(progress).toEqual([40, 100])
    expect(socket.closed).toBe(true)
  })

  it('rejects with the worker error message when the job fails', async () => {
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) =>
      url.endsWith('/files') ? { data: { fileId: 'f1' } } : { data: { jobId: 'j1' } })
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { status: 'Failed', progressPercent: 30, error: 'No walls found on layers [SKETCH]' } })

    const done = runVectorization('p1', new File(['x'], 'plan.dxf'), () => {})
    await flush(); await flush()
    FakeWebSocket.instances[0].emit('Failed', 30)

    await expect(done).rejects.toThrow('No walls found on layers [SKETCH]')
  })

  it('falls back to polling if the socket drops before the job finishes', async () => {
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) =>
      url.endsWith('/files') ? { data: { fileId: 'f1' } } : { data: { jobId: 'j1' } })
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { status: 'Completed', progressPercent: 100 } })

    const done = runVectorization('p1', new File(['x'], 'plan.dxf'), () => {}, { pollIntervalMs: 1 })
    await flush(); await flush()
    FakeWebSocket.instances[0].onclose?.()

    await expect(done).resolves.toBeUndefined()
  })

  it('toolbar: importing a plan runs the AI job and then reloads geometry from the server', async () => {
    const run = vi.spyOn(await import('../src/services/aiJobService'), 'runVectorization').mockResolvedValue()
    const loadFromServer = vi.fn().mockResolvedValue(undefined)
    useGeometryStore.setState({ loadFromServer })

    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)
    const file = new File(['x'], 'plan.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/import plan/i), { target: { files: [file] } })

    await waitFor(() => expect(loadFromServer).toHaveBeenCalledWith('p1'))
    expect(run.mock.calls[0][0]).toBe('p1')
    expect(run.mock.calls[0][1]).toBe(file)
  })

  it('toolbar: shows the failure reason when the AI job fails', async () => {
    vi.spyOn(await import('../src/services/aiJobService'), 'runVectorization').mockRejectedValue(new Error('No walls found'))
    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/import plan/i), { target: { files: [new File(['x'], 'a.dxf')] } })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No walls found'))
  })
})
