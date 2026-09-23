import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Wall } from '../../../services/geometryService'

function segmentBox(start: { x: number; y: number }, end: { x: number; y: number }, wall: Wall): THREE.BufferGeometry {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const geometry = new THREE.BoxGeometry(length, wall.thicknessMeters, wall.heightMeters)
  geometry.rotateZ(angle)
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, wall.heightMeters / 2)
  return geometry
}

// One box per centerline segment: walls from the AI pipeline are polylines (e.g. DXF LWPOLYLINE), not just 2 points.
export function buildWallGeometry(wall: Wall): THREE.BufferGeometry {
  const segments: THREE.BufferGeometry[] = []
  for (let i = 0; i < wall.points.length - 1; i++) {
    const start = wall.points[i]
    const end = wall.points[i + 1]
    if (start.x === end.x && start.y === end.y) continue
    segments.push(segmentBox(start, end, wall))
  }
  if (segments.length === 1) return segments[0]
  if (segments.length === 0) return new THREE.BufferGeometry()
  const merged = mergeGeometries(segments)!
  segments.forEach((g) => g.dispose())
  return merged
}
