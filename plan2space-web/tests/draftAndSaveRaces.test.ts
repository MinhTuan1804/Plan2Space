import { describe, it, expect, vi, beforeEach } from 'vitest'
import { draftKey, useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

const wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 0 }]

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('drafts and saves in flight', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset()
    vi.mocked(geometryService.deriveRooms).mockReset().mockResolvedValue([{ points: square, label: 'Room 1' }])
    vi.mocked(geometryService.fetchGeometry).mockReset().mockResolvedValue({ walls: [wall], rooms: [], openings: [], version: 1 })
    useGeometryStore.setState({ projectId: 'p', walls: [wall], rooms: [], openings: [], version: 1,
                                dirty: false, wallsEdited: false, roomsRefreshFailed: false })
  })

  it('a restored draft still knows its walls were edited, so the save re-derives rooms', async () => {
    // Review finding: a reload before saving dropped wallsEdited, and stale rooms were saved against new walls.
    useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    useGeometryStore.setState({ walls: [], wallsEdited: false, dirty: false })   // the tab is gone

    await useGeometryStore.getState().loadFromServer('p')

    expect(useGeometryStore.getState().walls).toHaveLength(2)
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it('an edit made while the save is in flight stays unsaved, with its draft kept', async () => {
    const put = deferred<{ version: number }>()
    vi.mocked(geometryService.saveGeometry).mockReturnValue(put.promise)
    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 0 }, { x: 5, y: 0 }])

    const saving = useGeometryStore.getState().saveToServer('p')
    await vi.waitFor(() => expect(geometryService.saveGeometry).toHaveBeenCalled())
    useGeometryStore.getState().addWall([{ x: 5, y: 0 }, { x: 5, y: 3 }])   // user keeps drawing
    put.resolve({ version: 2 })
    await saving

    const state = useGeometryStore.getState()
    expect(state.version).toBe(2)
    expect(state.dirty).toBe(true)
    expect(state.wallsEdited).toBe(true)
    const draft = JSON.parse(localStorage.getItem(draftKey('p'))!)
    expect(draft.version).toBe(2)
    expect(draft.walls).toHaveLength(2)
  })

  it('the save sends the walls the rooms were derived from, not later edits', async () => {
    const derive = deferred<{ points: typeof square; label: string }[]>()
    vi.mocked(geometryService.deriveRooms).mockReturnValue(derive.promise)
    vi.mocked(geometryService.saveGeometry).mockResolvedValue({ version: 2 })
    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 0 }, { x: 5, y: 0 }])

    const saving = useGeometryStore.getState().saveToServer('p')
    useGeometryStore.getState().addWall([{ x: 5, y: 0 }, { x: 5, y: 3 }])   // edit during derivation
    derive.resolve([{ points: square, label: 'Room 1' }])
    await saving

    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].walls).toHaveLength(1)
    expect(useGeometryStore.getState().dirty).toBe(true)
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })
})
