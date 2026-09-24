import { Point, Wall } from '../services/geometryService'

export const DEFAULT_WALL_THICKNESS_M = 0.2
export const DEFAULT_WALL_HEIGHT_M = 2.8
export const WINDOW_SILL_HEIGHT_M = 0.9

// The API honours a client-supplied GUID if it is unused, so openings can reference a wall drawn in the same save.
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function closestOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  const point = { x: a.x + t * dx, y: a.y + t * dy }
  return { point, t, distance: Math.hypot(p.x - point.x, p.y - point.y) }
}

export function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  return total
}

export function distanceAlong(points: Point[], p: Point): number {
  let best = { distance: Infinity, along: 0 }
  let walked = 0
  for (let i = 0; i < points.length - 1; i++) {
    const segment = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    const hit = closestOnSegment(p, points[i], points[i + 1])
    if (hit.distance < best.distance) best = { distance: hit.distance, along: walked + hit.t * segment }
    walked += segment
  }
  return best.along
}

export function pointAlong(points: Point[], along: number): Point {
  let remaining = Math.max(0, along)
  for (let i = 0; i < points.length - 1; i++) {
    const segment = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    if (remaining <= segment && segment > 0) {
      const t = remaining / segment
      return { x: points[i].x + t * (points[i + 1].x - points[i].x), y: points[i].y + t * (points[i + 1].y - points[i].y) }
    }
    remaining -= segment
  }
  return { ...points[points.length - 1] }
}

export function nearestOnWalls(p: Point, walls: Wall[]): { wallId: string; point: Point; distance: number } | null {
  let best: { wallId: string; point: Point; distance: number } | null = null
  for (const wall of walls) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      const hit = closestOnSegment(p, wall.points[i], wall.points[i + 1])
      if (!best || hit.distance < best.distance) best = { wallId: wall.id, point: hit.point, distance: hit.distance }
    }
  }
  return best
}

export const MIN_WALL_LENGTH_M = 0.1

// A press and release closer than this is a click, not a wall.
export function wallFromDrag(start: Point, end: Point): Point[] | null {
  return Math.hypot(end.x - start.x, end.y - start.y) < MIN_WALL_LENGTH_M ? null : [start, end]
}

// Further than this from any wall, a click is not meant for a wall: nothing is placed.
export const OPENING_PICK_DISTANCE_M = 0.5

export function placeOpening(p: Point, walls: Wall[], widthM: number): { wallId: string; position: Point } | null {
  const hit = nearestOnWalls(p, walls)
  if (!hit || hit.distance > OPENING_PICK_DISTANCE_M) return null
  const wall = walls.find((w) => w.id === hit.wallId)!
  if (polylineLength(wall.points) < widthM) return null
  return { wallId: wall.id, position: alongClamped(wall.points, distanceAlong(wall.points, hit.point), widthM) }
}

// An opening keeps its distance from the wall's first point, clamped so it stays inside the wall.
export function alongClamped(points: Point[], along: number, widthM: number): Point {
  const length = polylineLength(points)
  const half = Math.min(widthM / 2, length / 2)
  return pointAlong(points, Math.min(Math.max(along, half), length - half))
}

// Shorter than this, a measured line is a mis-click, not a dimension.
export const MIN_MEASURE_M = 0.05

// How much every position must be multiplied by so the measured line becomes its real length.
export function calibrationFactor(measuredM: number, realM: number): number | null {
  if (!(measuredM >= MIN_MEASURE_M) || !Number.isFinite(realM) || !(realM > 0)) return null
  return realM / measuredM
}

function ring(points: Point[]): Point[] {
  const n = points.length
  return n > 1 && points[0].x === points[n - 1].x && points[0].y === points[n - 1].y ? points.slice(0, -1) : points
}

export function polygonArea(points: Point[]): number {
  const p = ring(points)
  let sum = 0
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function polygonCentroid(points: Point[]): Point {
  const p = ring(points)
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) {
    const s = p[i]
    const t = p[(i + 1) % p.length]
    const cross = s.x * t.y - t.x * s.y
    a += cross
    cx += (s.x + t.x) * cross
    cy += (s.y + t.y) * cross
  }
  if (Math.abs(a) < 1e-12) {
    return { x: p.reduce((m, q) => m + q.x, 0) / p.length, y: p.reduce((m, q) => m + q.y, 0) / p.length }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}
