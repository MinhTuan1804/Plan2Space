import { describe, it, expect, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import { Opening, Wall } from '../src/services/geometryService'

const wall = (id: string, a: [number, number], b: [number, number]): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 })
const door = (id: string, wallId: string, x: number, y: number): Opening =>
  ({ id, wallId, type: 'Door', position: { x, y }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 })

describe('geometry edit actions', () => {
  beforeEach(() => useGeometryStore.setState({
    projectId: 'p', walls: [wall('w1', [0, 0], [4, 0])], rooms: [], openings: [door('d1', 'w1', 1, 0)],
    version: 1, dirty: false, wallsEdited: false,
  }))

  it('addWall appends a default-sized wall and returns its id', () => {
    const id = useGeometryStore.getState().addWall([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    const added = useGeometryStore.getState().walls.find((w) => w.id === id)!
    expect(added.thicknessMeters).toBe(0.2)
    expect(added.heightMeters).toBe(2.8)
    expect(useGeometryStore.getState().dirty).toBe(true)
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it("deleteWall takes the wall's doors and windows with it", () => {
    // The API rejects a save whose opening points at a missing wall.
    useGeometryStore.getState().deleteWall('w1')
    expect(useGeometryStore.getState().walls).toHaveLength(0)
    expect(useGeometryStore.getState().openings).toHaveLength(0)
  })

  it('a moved wall carries its doors at the same distance from its start', () => {
    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 2 }, { x: 4, y: 2 }])
    expect(useGeometryStore.getState().openings[0].position).toEqual({ x: 1, y: 2 })
    expect(useGeometryStore.getState().wallsEdited).toBe(true)
  })

  it('stretching a wall leaves its doors where they are', () => {
    useGeometryStore.getState().moveWallPoint('w1', 1, { x: 8, y: 0 })
    expect(useGeometryStore.getState().walls[0].points[1]).toEqual({ x: 8, y: 0 })
    expect(useGeometryStore.getState().openings[0].position).toEqual({ x: 1, y: 0 })
  })

  it('shortening a wall keeps its doors inside it', () => {
    useGeometryStore.getState().moveWallPoint('w1', 1, { x: 1, y: 0 })
    const { position } = useGeometryStore.getState().openings[0]   // 1 m wall, 0.9 m door
    expect(position.x).toBeCloseTo(0.55)
    expect(position.y).toBe(0)
  })

  it('updateOpening and deleteOpening edit only that opening and leave walls unedited', () => {
    useGeometryStore.getState().updateOpening('d1', { widthMeters: 1.2 })
    expect(useGeometryStore.getState().openings[0].widthMeters).toBe(1.2)
    useGeometryStore.getState().deleteOpening('d1')
    expect(useGeometryStore.getState().openings).toHaveLength(0)
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
    expect(useGeometryStore.getState().dirty).toBe(true)
  })
})
