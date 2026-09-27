import * as THREE from 'three'

// The second leaf of a double door: the same leaf turned round (half a turn about a vertical axis through the
// hinge line and the middle of its thickness), so it hangs on the other jamb at the same depth in the wall. It is a
// real turn, not a mirror: a negative scale needs every shader to handle a flipped matrix; a turn needs nothing.
export function turnedAround(model: THREE.Object3D): THREE.Group {
  const copy = model.clone(true)
  const box = new THREE.Box3().setFromObject(copy)
  const midZ = (box.min.z + box.max.z) / 2
  const turn = new THREE.Group()
  turn.rotation.y = Math.PI          // (x, y, z) -> (-x, y, -z) ...
  turn.position.z = 2 * midZ         // ... and back to the same depth: z -> 2 midZ - z
  turn.add(copy)
  const out = new THREE.Group()
  out.add(turn)
  out.updateMatrixWorld(true)
  return out
}

const plainCache = new WeakMap<THREE.Material, THREE.Material>()

// The door models' normal map has its tangents flipped on one face of the leaf: that face was shaded as if
// turned away from the light and showed much darker, so a double door (one leaf showing each face) came out in
// two colours. The door faces are flat, so the map adds nothing visible: the doors are drawn without it.
export function withoutNormalMaps<T extends THREE.Object3D>(model: T): T {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const plain = (m: THREE.Material) => {
      if (!(m as THREE.MeshStandardMaterial).normalMap) return m
      let copy = plainCache.get(m)
      if (!copy) { copy = m.clone(); (copy as THREE.MeshStandardMaterial).normalMap = null; plainCache.set(m, copy) }
      return copy
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(plain) : plain(mesh.material)
  })
  return model
}
