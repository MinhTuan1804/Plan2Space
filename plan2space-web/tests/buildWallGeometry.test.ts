import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { Wall } from '../src/services/geometryService'

describe('buildWallGeometry', () => {
  it('produces a box geometry with length matching the wall centerline', () => {
    const wall: Wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
    const geometry = buildWallGeometry(wall)
    geometry.computeBoundingBox()
    const size = new THREE.Vector3()
    geometry.boundingBox!.getSize(size)
    expect(size.x).toBeCloseTo(5, 3)
    expect(size.z).toBeCloseTo(2.8, 3)
  })
})
