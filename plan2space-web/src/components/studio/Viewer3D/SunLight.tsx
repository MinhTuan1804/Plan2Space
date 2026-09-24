import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGeometryStore } from '../../../stores/geometryStore'
import { shadowFrame } from './floorPlan'

// The shadow-casting sun, aimed at the house and with a shadow box that covers all of it.
export function SunLight() {
  const walls = useGeometryStore((s) => s.walls)
  const { centre, halfSize } = useMemo(() => shadowFrame(walls), [walls])
  const target = useMemo(() => new THREE.Object3D(), [])
  useEffect(() => {
    target.position.set(centre[0], centre[1], centre[2])
    target.updateMatrixWorld()
  }, [target, centre])

  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={[centre[0] + 10, 25, centre[2] + 8]}
        target={target}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-halfSize}
        shadow-camera-right={halfSize}
        shadow-camera-top={halfSize}
        shadow-camera-bottom={-halfSize}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />
    </>
  )
}
