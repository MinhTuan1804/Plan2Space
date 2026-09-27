import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

const PUBLISH_EVERY_S = 0.1
export interface ViewMarker { x: number; y: number; headingDeg: number; targetHeight: number; camera: [number, number, number] }

// Where the orbit view looks, in plan terms (the target point, the heading clockwise from plan +y, the camera
// in plan [x, y, h]), handed out at 10 Hz for overlays like the minimap.
export function ViewTracker({ onChange }: { onChange: (m: ViewMarker) => void }) {
  const { camera, controls } = useThree()
  const since = useRef(0)
  const dir = useRef(new THREE.Vector3())
  useFrame((_, delta) => {
    since.current += delta
    if (since.current < PUBLISH_EVERY_S) return
    since.current = 0
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? new THREE.Vector3()
    camera.getWorldDirection(dir.current)
    onChange({
      x: target.x, y: -target.z, targetHeight: target.y,
      headingDeg: (Math.atan2(dir.current.x, -dir.current.z) * 180) / Math.PI,
      camera: [camera.position.x, -camera.position.z, camera.position.y],
    })
  })
  return null
}
