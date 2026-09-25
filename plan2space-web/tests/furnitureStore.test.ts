import { describe, it, expect, vi, beforeEach } from 'vitest'
import { draftKey, useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

const square = (x: number, y: number, s: number) =>
  [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }, { x, y }]

describe('furniture in the store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(geometryService.deriveRooms).mockReset()
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false,
      walls: [], openings: [], furniture: [], rooms: [{ id: 'r1', label: 'Phòng ngủ', version: 1, points: square(0, 0, 4) }] })
  })

  it('adds, moves, rotates and deletes furniture without touching walls', () => {
    const id = useGeometryStore.getState().addFurniture({ catalogId: 'bed_double', x: 1, y: 1, rotationDeg: 0 })
    useGeometryStore.getState().moveFurniture(id, 2, 2)
    useGeometryStore.getState().rotateFurniture(id, 90)
    useGeometryStore.getState().rotateFurniture(id, 300)
    expect(useGeometryStore.getState().furniture[0]).toMatchObject({ x: 2, y: 2, rotationDeg: 30 })
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
    expect(useGeometryStore.getState().dirty).toBe(true)
    useGeometryStore.getState().deleteFurniture(id)
    expect(useGeometryStore.getState().furniture).toHaveLength(0)
  })

  it("replacing a room's furniture leaves other rooms' furniture alone", () => {
    useGeometryStore.getState().addFurniture({ catalogId: 'sofa_set', x: 1, y: 1, rotationDeg: 0 })   // in the room
    useGeometryStore.getState().addFurniture({ catalogId: 'fridge', x: 9, y: 9, rotationDeg: 0 })     // elsewhere
    useGeometryStore.getState().replaceFurnitureInRoom(square(0, 0, 4), [{ catalogId: 'bed_double', x: 2, y: 1, rotationDeg: 0 }])
    expect(useGeometryStore.getState().furniture.map((f) => f.catalogId).sort()).toEqual(['bed_double', 'fridge'])
  })

  it('furniture is saved, drafted and scaled with the plan', async () => {
    useGeometryStore.getState().addFurniture({ catalogId: 'sofa_set', x: 2, y: 4, rotationDeg: 90 })
    expect(JSON.parse(localStorage.getItem(draftKey('p'))!).furniture).toHaveLength(1)
    useGeometryStore.getState().scalePlan(0.5)
    expect(useGeometryStore.getState().furniture[0]).toMatchObject({ x: 1, y: 2, rotationDeg: 90 })
    await useGeometryStore.getState().saveToServer('p')
    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].furniture[0]).toMatchObject({ catalogId: 'sofa_set', x: 1, y: 2 })
  })

  it('a re-derived room keeps the label the user gave the room it replaces', async () => {
    // Review focus: editing a wall must not turn "Phòng ngủ" back into "Room 1".
    vi.mocked(geometryService.deriveRooms).mockResolvedValue([{ points: square(0, 0, 3.8), label: 'Room 1' }])
    useGeometryStore.setState({ wallsEdited: true, dirty: true })
    await useGeometryStore.getState().saveToServer('p')
    expect(useGeometryStore.getState().rooms[0].label).toBe('Phòng ngủ')
  })

  it('loading a plan picks up its furniture', async () => {
    vi.mocked(geometryService.fetchGeometry).mockResolvedValue({ walls: [], rooms: [], openings: [], version: 3,
      furniture: [{ id: 'f1', catalogId: 'tv', x: 1, y: 2, rotationDeg: 0 }] })
    await useGeometryStore.getState().loadFromServer('p')
    expect(useGeometryStore.getState().furniture).toHaveLength(1)
  })
})
