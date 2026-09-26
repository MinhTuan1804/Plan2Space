import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { splitWallFacesByRoom } from '../src/components/studio/Viewer3D/wallPaint'
import { Room, Wall } from '../src/services/geometryService'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
const room = (id: string, points: Room['points'], wallColor?: string): Room => ({ id, label: id, points, version: 1, wallColor })
const wall: Wall = { id: 'w', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 3, version: 1 }

// Triangles per material slot, from the geometry's groups.
function trianglesPerSlot(g: THREE.BufferGeometry): Record<number, number> {
  const out: Record<number, number> = {}
  for (const grp of g.groups) out[grp.materialIndex ?? 0] = (out[grp.materialIndex ?? 0] ?? 0) + grp.count / 3
  return out
}

describe('wall faces painted by the room they face', () => {
  it('a zero-length wall (all points the same) has nothing to paint and does not throw', () => {
    const dot: Wall = { ...wall, points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }
    const { geometry, roomIds } = splitWallFacesByRoom(buildWallGeometry(dot), dot, [room('in', box(0, 0, 4, 3))])
    expect(roomIds).toEqual([])
    expect(geometry.getAttribute('position')).toBeUndefined()
  })

  it('a wall between two rooms: each long face goes to its own room, the rest keeps the default paint', () => {
    const north = room('north', box(0, 0, 4, 3))
    const south = room('south', box(0, -3, 4, 0))
    const { geometry, roomIds } = splitWallFacesByRoom(buildWallGeometry(wall), wall, [north, south])
    expect(roomIds.sort()).toEqual(['north', 'south'])
    const slots = trianglesPerSlot(geometry)
    expect(slots[0]).toBe(8)                                  // ends and top/bottom
    expect(slots[1 + roomIds.indexOf('north')]).toBe(2)
    expect(slots[1 + roomIds.indexOf('south')]).toBe(2)
  })

  it("an outside wall: only the face inside the house belongs to a room", () => {
    const { geometry, roomIds } = splitWallFacesByRoom(buildWallGeometry(wall), wall, [room('in', box(0, 0, 4, 3))])
    expect(roomIds).toEqual(['in'])
    expect(trianglesPerSlot(geometry)).toEqual({ 0: 10, 1: 2 })
  })
})

describe('room wall colour in the store', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(geometryService.deriveRooms).mockReset()
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false,
      walls: [], openings: [], furniture: [], rooms: [room('r1', box(0, 0, 4, 4))] })
  })

  it('sets and clears the colour, marks the plan unsaved, and saves it', async () => {
    useGeometryStore.getState().setRoomWallColor('r1', '#CFE3D4')
    expect(useGeometryStore.getState().rooms[0].wallColor).toBe('#CFE3D4')
    expect(useGeometryStore.getState().dirty).toBe(true)
    await useGeometryStore.getState().saveToServer('p')
    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].rooms[0].wallColor).toBe('#CFE3D4')
    useGeometryStore.getState().setRoomWallColor('r1', null)
    expect(useGeometryStore.getState().rooms[0].wallColor).toBeUndefined()
  })

  it('a re-derived room keeps the paint of the room it replaces', async () => {
    useGeometryStore.getState().setRoomWallColor('r1', '#F0D9D6')
    vi.mocked(geometryService.deriveRooms).mockResolvedValue([{ points: box(0, 0, 3.8, 3.8), label: 'Room 1' }])
    useGeometryStore.setState({ wallsEdited: true })
    await useGeometryStore.getState().saveToServer('p')
    expect(useGeometryStore.getState().rooms[0].wallColor).toBe('#F0D9D6')
  })
})
