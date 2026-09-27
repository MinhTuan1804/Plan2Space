import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { turnedAround } from '../src/components/studio/Viewer3D/mirror'

describe('the second leaf of a double door', () => {
  // A leaf: 0.8 wide (x 0..0.8), 2 high, 4 cm thick (z 0.02..0.06), hinged at x = 0.
  const leaf = () => {
    const g = new THREE.Group()
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.04), new THREE.MeshStandardMaterial())
    box.position.set(0.4, 1, 0.04)
    g.add(box)
    return g
  }

  it('is the same leaf turned round: x mirrored about the hinge, same depth in the wall, no negative scale', () => {
    const turned = turnedAround(leaf())
    turned.updateMatrixWorld(true)
    const b = new THREE.Box3().setFromObject(turned)
    expect(b.min.x).toBeCloseTo(-0.8); expect(b.max.x).toBeCloseTo(0)
    expect(b.min.z).toBeCloseTo(0.02); expect(b.max.z).toBeCloseTo(0.06)
    turned.traverse((o) => { if ((o as THREE.Mesh).isMesh) expect(o.matrixWorld.determinant()).toBeGreaterThan(0) })
  })

  it('leaves the original model alone', () => {
    const original = leaf()
    turnedAround(original)
    expect(new THREE.Box3().setFromObject(original).min.x).toBeCloseTo(0)
  })
})

import { withoutNormalMaps } from '../src/components/studio/Viewer3D/mirror'

describe('door materials', () => {
  it('drop their normal map (its tangents are flipped on one face of the leaf, darkening that face)', () => {
    const mat = new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture() })
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    const model = new THREE.Group(); model.add(mesh)
    withoutNormalMaps(model)
    expect((mesh.material as THREE.MeshStandardMaterial).normalMap).toBeNull()
    expect(mat.normalMap).not.toBeNull()                  // the shared, cached original is untouched
  })
})
