import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useEditorStore } from '../../../stores/editorStore'
import { useGeometryStore } from '../../../stores/geometryStore'
import { levelsIn } from '../../../lib/levels'
import { ease, lerp3, toWorld } from '../../../lib/cameraViews'
import { Vec3 } from '../../../services/viewSettingsService'

const FLY_S = 0.8

// Carries out editorStore.flyTo: eases the camera and the orbit target there over 0.8 s, then clears it.
// A view on a storey the house no longer has shows the nearest one there is.
export function CameraRig() {
  const { camera, controls } = useThree()
  const flyTo = useEditorStore((s) => s.flyTo)
  const walls = useGeometryStore((s) => s.walls)
  const flight = useRef<{ from: [Vec3, Vec3]; to: [Vec3, Vec3]; t: number } | null>(null)

  useEffect(() => {
    if (!flyTo) return
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    const levels = levelsIn(walls)
    const have = levels.length ? levels : [0]
    const level = have.reduce((a, b) => (Math.abs(b - flyTo.level) < Math.abs(a - flyTo.level) ? b : a))
    useEditorStore.getState().setLevel(level)
    flight.current = {
      from: [camera.position.toArray() as Vec3, target.toArray() as Vec3],
      to: [toWorld(flyTo.position), toWorld(flyTo.target)],
      t: 0,
    }
  }, [flyTo, camera, controls, walls])

  useFrame((_, delta) => {
    const f = flight.current
    const target = (controls as unknown as { target?: THREE.Vector3; update?: () => void } | null)
    if (!f || !target?.target) return
    f.t = Math.min(1, f.t + delta / FLY_S)
    const k = ease(f.t)
    camera.position.set(...lerp3(f.from[0], f.to[0], k))
    target.target.set(...lerp3(f.from[1], f.to[1], k))
    target.update?.()
    if (f.t >= 1) {
      flight.current = null
      useEditorStore.getState().setFlyTo(null)
    }
  })
  return null
}
