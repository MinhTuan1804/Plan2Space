import React, { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { CatalogEntry, useCatalog } from '../../../services/catalogService'

function Box({ entry }: { entry: CatalogEntry }) {
  return (
    <mesh position={[0, 0, entry.heightM / 2]} castShadow receiveShadow>
      <boxGeometry args={[entry.widthM, entry.depthM, entry.heightM]} />
      <meshStandardMaterial color="#cbbba2" roughness={0.8} />
    </mesh>
  )
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  useEffect(() => {
    clone.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true } })
  }, [clone])
  // glTF is Y-up with its front along +Z; +90° about X maps it to plan-up with its front along plan -y.
  return <primitive object={clone} rotation={[Math.PI / 2, 0, 0]} />
}

// Furniture in plan space; items whose catalog entry is gone are skipped.
export function FurnitureModels() {
  const furniture = useGeometryStore((s) => s.furniture)
  const catalog = useCatalog()
  if (!catalog) return null
  return (
    <>
      {furniture.map((f) => {
        const entry = catalog.byId[f.catalogId]
        if (!entry) return null
        return (
          <group key={f.id} position={[f.x, f.y, entry.elevationM]} rotation={[0, 0, (f.rotationDeg * Math.PI) / 180]}>
            {entry.file ? <Suspense fallback={<Box entry={entry} />}><Model url={entry.file} /></Suspense> : <Box entry={entry} />}
          </group>
        )
      })}
    </>
  )
}
