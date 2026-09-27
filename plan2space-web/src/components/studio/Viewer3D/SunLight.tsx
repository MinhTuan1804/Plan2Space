import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGeometryStore } from '../../../stores/geometryStore'
import { shadowFrame } from './floorPlan'
import { SUN_INTENSITY } from './lighting'
import { useSun } from './SunStudyPanel'

const SUN_DISTANCE_M = 40
const MIN_DAY_SHARE = 0.3

// The shadow-casting sun where the sun study puts it, aimed at the house with a shadow box covering all of it.
// Below the horizon it is off: night.
export function SunLight() {
  const walls = useGeometryStore((s) => s.walls)
  const { centre, halfSize } = useMemo(() => shadowFrame(walls), [walls])
  const target = useMemo(() => new THREE.Object3D(), [])
  const sun = useSun()
  const [dx, dy, dz] = sun.direction
  const strength = Math.min(1, Math.max(MIN_DAY_SHARE, Math.sin((sun.altitudeDeg * Math.PI) / 180)))
  useEffect(() => {
    target.position.set(centre[0], centre[1], centre[2])
    target.updateMatrixWorld()
  }, [target, centre])

  return (
    <>
      <primitive object={target} />
      <directionalLight
        position={[centre[0] + dx * SUN_DISTANCE_M, centre[1] + dy * SUN_DISTANCE_M, centre[2] + dz * SUN_DISTANCE_M]}
        visible={sun.up}
        target={target}
        intensity={SUN_INTENSITY * strength}
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
