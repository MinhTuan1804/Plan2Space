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
