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
// `extend` lengthens the wall past its first and last points (see wallJoints.ts); a polyline's own bends
// are closed by running each segment half the thickness past the bend.
export function buildWallGeometry(wall: Wall, extend: [number, number] = [0, 0]): THREE.BufferGeometry {
  const pts = wall.points.filter((p, i) => i === 0 || p.x !== wall.points[i - 1].x || p.y !== wall.points[i - 1].y)
  const segments: THREE.BufferGeometry[] = []
  const bend = wall.thicknessMeters / 2
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const ux = (b.x - a.x) / length
    const uy = (b.y - a.y) / length
    const back = i === 0 ? extend[0] : bend
    const ahead = i === pts.length - 2 ? extend[1] : bend
    segments.push(segmentBox({ x: a.x - ux * back, y: a.y - uy * back }, { x: b.x + ux * ahead, y: b.y + uy * ahead }, wall))
  }
  if (segments.length === 1) return segments[0]
  if (segments.length === 0) return new THREE.BufferGeometry()
  const merged = mergeGeometries(segments)!
  segments.forEach((g) => g.dispose())
  return merged
}
