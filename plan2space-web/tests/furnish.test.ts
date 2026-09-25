import { describe, it, expect, vi, beforeEach } from 'vitest'
import { autoFurnishRoom } from '../src/lib/furnish'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as stagingService from '../src/services/stagingService'
import { Catalog } from '../src/services/catalogService'

vi.mock('../src/services/stagingService')

const entry = (id: string, againstWall: boolean) =>
  ({ id, name: id, file: null, widthM: 1, depthM: 1, heightM: 1, elevationM: 0, againstWall, roomTypes: ['bedroom' as const], attribution: '' })
const catalog: Catalog = {
  items: [entry('bed_double', true), entry('nightstand', true)],
  autoFurnish: { bedroom: ['bed_double', 'nightstand'], living: [], dining: [], kitchen: [], bathroom: [] },
  byId: {},
}
catalog.byId = Object.fromEntries(catalog.items.map((i) => [i.id, i]))
const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }]

describe('auto-furnish', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(stagingService.suggestFurniture).mockReset()
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, walls: [],
      rooms: [{ id: 'r1', label: 'Phòng ngủ', version: 1, points: square }],
      openings: [{ id: 'd1', wallId: 'w', type: 'Door', position: { x: 2, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 },
                 { id: 'n1', wallId: 'w', type: 'Window', position: { x: 0, y: 2 }, widthMeters: 1.2, sillHeightMeters: 0.9, version: 1 }],
      furniture: [{ id: 'old', catalogId: 'sofa_set', x: 1, y: 1, rotationDeg: 0 }, { id: 'out', catalogId: 'fridge', x: 9, y: 9, rotationDeg: 0 }] })
  })

  it("asks for the room type's items, keeps doors clear, and replaces only this room's furniture", async () => {
    vi.mocked(stagingService.suggestFurniture).mockResolvedValue([{ item: 'bed_double', position: [2, 1.2], rotationDeg: 180 }])

    expect(await autoFurnishRoom('r1', catalog)).toBeNull()

    const [, label, items, keepClear] = vi.mocked(stagingService.suggestFurniture).mock.calls[0]
    expect(label).toBe('Phòng ngủ')
    expect(items.map((i) => i.id)).toEqual(['bed_double', 'nightstand'])
    expect(keepClear).toEqual([[2, 0, 0.9]])                          // doors only, not windows
    expect(useGeometryStore.getState().furniture.map((f) => f.catalogId).sort()).toEqual(['bed_double', 'fridge'])
  })

  it('a room without a type asks the user to choose one first', async () => {
    useGeometryStore.setState({ rooms: [{ id: 'r1', label: 'Room 1', version: 1, points: square }] })
    expect(await autoFurnishRoom('r1', catalog)).toMatch(/type/i)
    expect(stagingService.suggestFurniture).not.toHaveBeenCalled()
  })

  it('a failed request leaves the room as it was', async () => {
    vi.mocked(stagingService.suggestFurniture).mockRejectedValue(new Error('503'))
    expect(await autoFurnishRoom('r1', catalog)).toBeTruthy()
    expect(useGeometryStore.getState().furniture).toHaveLength(2)
  })

  it("the server's reason is shown when it gives one (e.g. an uncalibrated, oversized room)", async () => {
    vi.mocked(stagingService.suggestFurniture).mockRejectedValue({ response: { status: 400, data: { message: 'Calibrate the plan first.' } } })
    expect(await autoFurnishRoom('r1', catalog)).toBe('Calibrate the plan first.')
  })
})
