import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }]
const oldRoom = { id: 'r-old', points: square, label: 'Room 1', version: 1 }

describe('rooms on save', () => {
  beforeEach(() => {
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(geometryService.deriveRooms).mockReset()
    useGeometryStore.setState({
      projectId: 'p', rooms: [oldRoom], openings: [], version: 1, dirty: true, wallsEdited: false, roomsRefreshFailed: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
    })
  })

  it('after a wall edit the rooms are derived again and saved', async () => {
    vi.mocked(geometryService.deriveRooms).mockResolvedValue([{ points: square, label: 'Room 1' }, { points: square, label: 'Room 2' }])
    useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])

    await useGeometryStore.getState().saveToServer('p')

    expect(vi.mocked(geometryService.deriveRooms).mock.calls[0][0]).toHaveLength(2)
    const saved = vi.mocked(geometryService.saveGeometry).mock.calls[0][2]
    expect(saved.rooms.map((r) => r.label)).toEqual(['Room 1', 'Room 2'])
    expect(useGeometryStore.getState().rooms).toHaveLength(2)
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
  })

  it('when rooms cannot be derived the walls still save with the old rooms, and the next save retries', async () => {
    vi.mocked(geometryService.deriveRooms).mockRejectedValue(new Error('503'))
    useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])

    await useGeometryStore.getState().saveToServer('p')

    const saved = vi.mocked(geometryService.saveGeometry).mock.calls[0][2]
    expect(saved.walls).toHaveLength(2)
    expect(saved.rooms.map((r) => r.id)).toEqual(['r-old'])
    expect(useGeometryStore.getState().roomsRefreshFailed).toBe(true)
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it('an opening-only edit does not re-derive rooms', async () => {
    useGeometryStore.getState().addOpening({ id: 'd1', wallId: 'w1', type: 'Door', position: { x: 1, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 0 })

    await useGeometryStore.getState().saveToServer('p')

    expect(geometryService.deriveRooms).not.toHaveBeenCalled()
  })
})
