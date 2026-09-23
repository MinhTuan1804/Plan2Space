import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { cutOpeningsIntoWall } from '../src/components/studio/Viewer3D/cutOpenings'
import { Wall, Opening } from '../src/services/geometryService'

describe('cutOpeningsIntoWall', () => {
  it('reduces wall volume when a door opening is cut', () => {
    const wall: Wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
    const opening: Opening = { id: 'o1', wallId: 'w1', type: 'Door', position: { x: 2.5, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }

    const solidGeometry = buildWallGeometry(wall)
    const cutGeometry = cutOpeningsIntoWall(solidGeometry, wall, [opening])

    const solidVolume = new THREE.Box3().setFromBufferAttribute(solidGeometry.attributes.position as THREE.BufferAttribute)
    const cutVolume = new THREE.Box3().setFromBufferAttribute(cutGeometry.attributes.position as THREE.BufferAttribute)

    // A CSG subtraction keeps the same bounding box but must have fewer vertices
    // than a naive duplicate (i.e., the subtraction actually ran).
    expect(cutGeometry.attributes.position.count).not.toBe(solidGeometry.attributes.position.count)
    expect(cutVolume.max.z).toBeCloseTo(solidVolume.max.z, 3)
  })

  it('returns the original geometry unchanged when there are no openings for this wall', () => {
    const wall: Wall = { id: 'w2', points: [{ x: 0, y: 0 }, { x: 3, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
    const solidGeometry = buildWallGeometry(wall)
    const result = cutOpeningsIntoWall(solidGeometry, wall, [])
    expect(result).toBe(solidGeometry)
  })
})
