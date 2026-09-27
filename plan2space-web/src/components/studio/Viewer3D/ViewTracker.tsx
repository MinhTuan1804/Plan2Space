import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'

const PUBLISH_EVERY_S = 0.1
export interface ViewMarker { x: number; y: number; headingDeg: number; targetHeight: number; camera: [number, number, number] }

const SAME_M = 1e-3
const SAME_DEG = 0.5
// Whether the view has not moved enough to be worth telling anyone (a re-render of the whole 3D page).
export function sameMarker(a: ViewMarker | null, b: ViewMarker): boolean {
  if (!a) return false
  const near = (u: number, v: number, eps = SAME_M) => Math.abs(u - v) < eps
  return near(a.x, b.x) && near(a.y, b.y) && near(a.targetHeight, b.targetHeight) && near(a.headingDeg, b.headingDeg, SAME_DEG)
    && a.camera.every((c, i) => near(c, b.camera[i]))
}

// Where the orbit view looks, in plan terms (the target point, the heading clockwise from plan +y, the camera
// in plan [x, y, h]), handed out at most at 10 Hz and only when it moved, for overlays like the minimap.
export function ViewTracker({ onChange }: { onChange: (m: ViewMarker) => void }) {
  const { camera, controls } = useThree()
  const since = useRef(0)
  const dir = useRef(new THREE.Vector3())
  const last = useRef<ViewMarker | null>(null)
  useFrame((_, delta) => {
    since.current += delta
    if (since.current < PUBLISH_EVERY_S) return
    since.current = 0
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? new THREE.Vector3()
    camera.getWorldDirection(dir.current)
    const next: ViewMarker = {
      x: target.x, y: -target.z, targetHeight: target.y,
      headingDeg: (Math.atan2(dir.current.x, -dir.current.z) * 180) / Math.PI,
      camera: [camera.position.x, -camera.position.z, camera.position.y],
    }
    if (sameMarker(last.current, next)) return
    last.current = next
    onChange(next)
  })
  return null
}
