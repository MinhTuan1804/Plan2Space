import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as geometryService from '../src/services/geometryService'
import * as aiJobService from '../src/services/aiJobService'
import * as exportService from '../src/services/exportService'
import { apiClient } from '../src/services/api'
import { useGeometryStore, draftKey } from '../src/stores/geometryStore'
import { StudioToolbar } from '../src/components/studio/StudioToolbar'
import { CopilotChat } from '../src/components/studio/Copilot/CopilotChat'
import { useUnsavedChangesWarning } from '../src/hooks/useUnsavedChangesWarning'

// Final review I3/I4: unsaved edits must not be silently lost or overwritten.
const wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 3 }
const server = { walls: [wall], rooms: [], openings: [], version: 3 }

beforeEach(() => {
  localStorage.clear()
  useGeometryStore.setState({ projectId: null, walls: [], rooms: [], openings: [], version: 0, saveConflict: false, dirty: false, draftDiscarded: false })
})
afterEach(() => vi.restoreAllMocks())

describe('unsaved edits', () => {
  it('editing marks the plan dirty and keeps a local draft; saving clears both', async () => {
    vi.spyOn(geometryService, 'fetchGeometry').mockResolvedValue(server)
    vi.spyOn(geometryService, 'saveGeometry').mockResolvedValue({ version: 4 })
    await useGeometryStore.getState().loadFromServer('p1')

    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 1 }, { x: 5, y: 1 }])
    expect(useGeometryStore.getState().dirty).toBe(true)
    expect(JSON.parse(localStorage.getItem(draftKey('p1'))!).version).toBe(3)

    await useGeometryStore.getState().saveToServer('p1')
    expect(useGeometryStore.getState().dirty).toBe(false)
    expect(localStorage.getItem(draftKey('p1'))).toBeNull()
  })

  it('a draft from before a reload or forced re-login is restored when the server plan has not changed', async () => {
    const edited = { ...wall, points: [{ x: 0, y: 2 }, { x: 5, y: 2 }] }
    localStorage.setItem(draftKey('p1'), JSON.stringify({ version: 3, walls: [edited], rooms: [], openings: [] }))
    vi.spyOn(geometryService, 'fetchGeometry').mockResolvedValue(server)

    await useGeometryStore.getState().loadFromServer('p1')

    expect(useGeometryStore.getState().walls[0].points[0].y).toBe(2)
    expect(useGeometryStore.getState().dirty).toBe(true)
  })

  it('a draft older than the server plan is dropped and the user is told', async () => {
    localStorage.setItem(draftKey('p1'), JSON.stringify({ version: 2, walls: [], rooms: [], openings: [] }))
    vi.spyOn(geometryService, 'fetchGeometry').mockResolvedValue(server)

    await useGeometryStore.getState().loadFromServer('p1')

    expect(useGeometryStore.getState().walls).toHaveLength(1)
    expect(useGeometryStore.getState().draftDiscarded).toBe(true)
    expect(localStorage.getItem(draftKey('p1'))).toBeNull()
  })

  it('warns before leaving the page with unsaved changes', () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChangesWarning(dirty), { initialProps: { dirty: false } })
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)

    rerender({ dirty: true })
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)
    unmount()
  })

  it('shows why a save failed (e.g. overlapping rooms)', async () => {
    useGeometryStore.setState({ saveToServer: vi.fn().mockRejectedValue({ response: { status: 422, data: { message: 'Overlapping rooms detected' } } }) })
    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Overlapping rooms detected'))
  })

  it('asks before an AI import replaces a plan that already has walls', async () => {
    useGeometryStore.setState({ walls: [wall] })
    const run = vi.spyOn(aiJobService, 'runVectorization').mockResolvedValue()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText(/import plan/i), { target: { files: [new File(['x'], 'a.dxf')] } })

    expect(confirm).toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('exports what the user sees: unsaved edits are saved first', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    useGeometryStore.setState({ dirty: true, saveToServer: save })
    const download = vi.spyOn(exportService, 'downloadExport').mockResolvedValue('x.glb')
    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /glb/i }))

    await waitFor(() => expect(download).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith('p1')
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(download.mock.invocationCallOrder[0])
  })

  it('co-pilot saves unsaved edits first and sends the version the user is looking at', async () => {
    const save = vi.fn().mockImplementation(async () => useGeometryStore.setState({ dirty: false, version: 8 }))
    useGeometryStore.setState({ dirty: true, version: 7, saveToServer: save, loadFromServer: vi.fn() })
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { action: 'unknown', appliedVersion: null, message: 'ok' } })
    render(<CopilotChat projectId="p1" />)

    const input = screen.getByPlaceholderText(/tell the co-pilot/i)
    fireEvent.change(input, { target: { value: 'move a wall' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith('p1')
    expect(post).toHaveBeenCalledWith('/copilot/message', { projectId: 'p1', message: 'move a wall', baseVersion: 8 })
  })
})
