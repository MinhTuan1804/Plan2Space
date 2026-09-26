import { Point, Wall } from '../../../services/geometryService'

// Walls are boxes cut at their centreline ends. Where two walls meet at an angle that leaves the outer
// corner square missing, and a wall drawn up to another wall's face stops short of its centreline.
// Each such end is pushed through to the far face of the wall it meets; the overlap hides inside.
const TOUCH_TOLERANCE_M = 0.02
// Ends stop this short of the far face: flush with it, the end's own face would flicker through that face,
// which shows as a stripe once rooms are painted different colours.
export const JOINT_INSET_M = 0.002
const PARALLEL_COS = Math.cos((10 * Math.PI) / 180)

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function unit(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
}

function endExtension(end: Point, direction: Point, wall: Wall, walls: Wall[], length: number): number {
  let extension = 0
  for (const other of walls) {
    if (other.id === wall.id) continue
    // No longer than the other wall is thick: a line capping its end (older DXF imports), not a wall.
    if (length <= other.thicknessMeters + TOUCH_TOLERANCE_M) continue
    for (let i = 0; i < other.points.length - 1; i++) {
      const a = other.points[i]
      const b = other.points[i + 1]
      const u = unit(a, b)
      if (Math.abs(u.x * direction.x + u.y * direction.y) >= PARALLEL_COS) continue   // a doorway neighbour
      const half = other.thicknessMeters / 2
      const distance = distanceToSegment(end, a, b)
      if (distance <= half + TOUCH_TOLERANCE_M) extension = Math.max(extension, distance + half - JOINT_INSET_M)
    }
  }
  return extension
}

// [start, end] lengths to add beyond the wall's first and last points.
export function wallEndExtensions(wall: Wall, walls: Wall[]): [number, number] {
  const pts = wall.points
  if (pts.length < 2) return [0, 0]
  const n = pts.length
  let length = 0
  for (let i = 0; i < n - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  return [
    endExtension(pts[0], unit(pts[1], pts[0]), wall, walls, length),
    endExtension(pts[n - 1], unit(pts[n - 2], pts[n - 1]), wall, walls, length),
  ]
}
