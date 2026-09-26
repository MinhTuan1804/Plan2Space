import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { cutOpeningsIntoWall } from '../src/components/studio/Viewer3D/cutOpenings'
import { splitWallFacesByRoom } from '../src/components/studio/Viewer3D/wallPaint'
import { Room, Wall } from '../src/services/geometryService'

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
const rooms: Room[] = [
  { id: 'north', label: 'n', version: 1, points: box(0, 0, 4, 3) },
  { id: 'south', label: 's', version: 1, points: box(0, -3, 4, 0) },
]

// Mean y of the triangles drawn with each room's paint: north's paint must sit on the north face (y > 0).
function sideOfPaint(g: THREE.BufferGeometry, roomIds: string[]): Record<string, number> {
  const pos = g.getAttribute('position')
  const out: Record<string, number> = {}
  for (const grp of g.groups) {
    if (!grp.materialIndex) continue
    let sum = 0
    for (let i = grp.start; i < grp.start + grp.count; i++) sum += pos.getY(i)
    out[roomIds[grp.materialIndex - 1]] = sum / grp.count
  }
  return out
}

describe('each room paints its own side of the wall', () => {
  it.each([
    ['drawn west to east', [{ x: 0, y: 0 }, { x: 4, y: 0 }]],
    ['drawn east to west', [{ x: 4, y: 0 }, { x: 0, y: 0 }]],
  ])('%s', (_, points) => {
    const wall: Wall = { id: 'w', points, thicknessMeters: 0.2, heightMeters: 3, version: 1 }
    const { geometry, roomIds } = splitWallFacesByRoom(buildWallGeometry(wall), wall, rooms)
    const y = sideOfPaint(geometry, roomIds)
    expect(y.north).toBeGreaterThan(0)
    expect(y.south).toBeLessThan(0)
  })

  it('also after a door is cut through the wall', () => {
    const wall: Wall = { id: 'w', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 3, version: 1 }
    const cut = cutOpeningsIntoWall(buildWallGeometry(wall), wall,
      [{ id: 'd', wallId: 'w', type: 'Door', position: { x: 2, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }])
    const { geometry, roomIds } = splitWallFacesByRoom(cut, wall, rooms)
    const y = sideOfPaint(geometry, roomIds)
    expect(y.north).toBeGreaterThan(0)
    expect(y.south).toBeLessThan(0)
  })
})

describe('a long wall shared by several rooms', () => {
  it('each room\'s paint stops exactly at the room\'s corner on the wall', () => {
    // One 9 m wall along y = 0 with three rooms north of it, split at x = 3 and x = 5.5 (the user's plan).
    const wall: Wall = { id: 'w', points: [{ x: 0, y: 0 }, { x: 9, y: 0 }], thicknessMeters: 0.22, heightMeters: 3, version: 1 }
    const three: Room[] = [
      { id: 'a', label: 'a', version: 1, points: box(0, 0, 3, 4) },
      { id: 'b', label: 'b', version: 1, points: box(3, 0, 5.5, 4) },
      { id: 'c', label: 'c', version: 1, points: box(5.5, 0, 9, 4) },
    ]
    const { geometry, roomIds } = splitWallFacesByRoom(buildWallGeometry(wall), wall, three)
    const pos = geometry.getAttribute('position')
    const span: Record<string, [number, number]> = { a: [0, 3], b: [3, 5.5], c: [5.5, 9] }
    let area: Record<string, number> = {}
    for (const grp of geometry.groups) {
      if (!grp.materialIndex) continue
      const id = roomIds[grp.materialIndex - 1]
      for (let i = grp.start; i < grp.start + grp.count; i++) {
        expect(pos.getX(i)).toBeGreaterThanOrEqual(span[id][0] - 1e-6)
        expect(pos.getX(i)).toBeLessThanOrEqual(span[id][1] + 1e-6)
      }
      area[id] = (area[id] ?? 0) + grp.count
    }
    expect(Object.keys(area).sort()).toEqual(['a', 'b', 'c'])
  })
})
