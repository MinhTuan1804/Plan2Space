import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { cutOpeningsIntoWall, openingCutterGeometry } from '../src/components/studio/Viewer3D/cutOpenings'
import { Wall, Opening } from '../src/services/geometryService'

// The AI pipeline (DXF LWPOLYLINE walls) produces walls with more than two points.
const lWall: Wall = {
  id: 'L', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1,
}

function size(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox()
  return geometry.boundingBox!.getSize(new THREE.Vector3())
}

describe('multi-segment walls', () => {
  it('extrudes every segment of a polyline wall, not just the first', () => {
    const s = size(buildWallGeometry(lWall))
    expect(s.x).toBeCloseTo(5.1, 3)   // 5m leg + half thickness of the vertical leg
    expect(s.y).toBeCloseTo(4.1, 3)   // 4m leg + half thickness of the horizontal leg
    expect(s.z).toBeCloseTo(2.8, 3)
  })

  it('orients an opening cutter along the segment the opening sits on', () => {
    const door: Opening = { id: 'o', wallId: 'L', type: 'Door', position: { x: 5, y: 2 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }
    const s = size(openingCutterGeometry(lWall, door))
    expect(s.x).toBeCloseTo(0.4, 3)   // across the vertical leg: 2 × thickness
    expect(s.y).toBeCloseTo(0.9, 3)   // along the vertical leg: door width
  })

  it('cuts an opening that sits on a later segment', () => {
    const door: Opening = { id: 'o', wallId: 'L', type: 'Door', position: { x: 5, y: 2 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }
    const solid = buildWallGeometry(lWall)
    const cut = cutOpeningsIntoWall(solid, lWall, [door])
    expect(cut.attributes.position.count).not.toBe(solid.attributes.position.count)
  })
})
