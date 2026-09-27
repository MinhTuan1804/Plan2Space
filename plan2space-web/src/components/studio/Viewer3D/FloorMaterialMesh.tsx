import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { useEditorStore } from '../../../stores/editorStore'
import { FLOOR_MATERIALS, FloorMaterialId } from '../../../lib/floorMaterials'
import { planUVs, texturePaths } from './pbr'

// A floor in a PBR material. It suspends while its maps load; drei's useTexture caches them, so rooms of one
// material share textures, and both sizes stay cached (switching quality disposes nothing still in use).
export function PbrFloor({ geometry, material, userData }: { geometry: THREE.ShapeGeometry; material: FloorMaterialId; userData: object }) {
  const quality = useEditorStore((s) => s.quality)
  const { tileM } = FLOOR_MATERIALS.find((m) => m.id === material)!
  const paths = texturePaths(material, quality)
  const [map, normalMap, roughnessMap] = useTexture([paths.color, paths.normal, paths.roughness])
  useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace
    for (const t of [map, normalMap, roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = quality === 'high' ? 8 : 1
      t.needsUpdate = true
    }
  }, [map, normalMap, roughnessMap, quality])
  const tiled = useMemo(() => { const g = geometry.clone(); planUVs(g, tileM); return g }, [geometry, tileM])
  useEffect(() => () => tiled.dispose(), [tiled])
  return (
    <mesh geometry={tiled} position={[0, 0, 0.002]} receiveShadow userData={userData}>
      <meshStandardMaterial map={map} normalMap={normalMap} roughnessMap={roughnessMap} />
    </mesh>
  )
}
