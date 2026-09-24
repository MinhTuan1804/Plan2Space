import { Opening, Point, Room, Wall } from '../services/geometryService'
import { polygonArea, polygonCentroid } from './planGeometry'

export const WALK_SPEED_MS = 1.4
export const RUN_SPEED_MS = 3
export const EYE_HEIGHT_M = 1.6
export const PLAYER_RADIUS_M = 0.25
export const MAX_STEP_S = 0.05          // a long frame (tab switch) must not carry the player through a wall
const DOOR_ON_SEGMENT_M = 0.3
const RESOLVE_PASSES = 4

export interface MoveKeys { forward: boolean; back: boolean; left: boolean; right: boolean; run: boolean }
export interface Blocker { a: Point; b: Point; halfWidth: number }

// Plan-space displacement for this frame. `facing` is the view direction projected on the floor.
export function moveVector(keys: MoveKeys, facing: Point, dt: number): Point {
  const length = Math.hypot(facing.x, facing.y)
  if (length === 0) return { x: 0, y: 0 }
  const f = { x: facing.x / length, y: facing.y / length }
  const right = { x: f.y, y: -f.x }
  const ahead = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
  const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const dx = f.x * ahead + right.x * side
  const dy = f.y * ahead + right.y * side
  const norm = Math.hypot(dx, dy)
  if (norm === 0) return { x: 0, y: 0 }
  // dt is capped by the caller (Math.min(delta, MAX_STEP_S)); the tests pass a whole second.
  const distance = (keys.run ? RUN_SPEED_MS : WALK_SPEED_MS) * dt
  return { x: (dx / norm) * distance, y: (dy / norm) * distance }
}

function closest(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t }
}

// Each wall segment becomes the blocking pieces left after taking out its door spans. A piece's end that
// borders a doorway is pulled back by the wall's half-thickness, so the doorway keeps its real width
// instead of being narrowed by the rounded end of the collision band.
export function wallBlockers(walls: Wall[], openings: Opening[]): Blocker[] {
  const blockers: Blocker[] = []
  for (const wall of walls) {
    const half = wall.thicknessMeters / 2
    const doors = openings.filter((o) => o.wallId === wall.id && o.type === 'Door')
    for (let i = 0; i < wall.points.length - 1; i++) {
      const a = wall.points[i]
      const b = wall.points[i + 1]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length === 0) continue
      const spans = doors
        .map((d) => ({ d, hit: closest(d.position, a, b) }))
        .filter(({ d, hit }) => Math.hypot(d.position.x - hit.point.x, d.position.y - hit.point.y) <= DOOR_ON_SEGMENT_M)
        .map(({ d, hit }) => [hit.t * length - d.widthMeters / 2, hit.t * length + d.widthMeters / 2] as [number, number])
        .sort((s, t) => s[0] - t[0])
      const at = (s: number) => ({ x: a.x + ((b.x - a.x) * s) / length, y: a.y + ((b.y - a.y) * s) / length })
      const piece = (s: number, e: number, startsAtDoor: boolean, endsAtDoor: boolean) => {
        const s2 = s + (startsAtDoor ? half : 0)
        const e2 = e - (endsAtDoor ? half : 0)
        if (e2 > s2) blockers.push({ a: at(s2), b: at(e2), halfWidth: half })
      }
      let from = 0
      let fromIsDoor = false
      for (const [s, e] of spans) {
        piece(from, Math.max(from, s), fromIsDoor, true)
        from = Math.min(length, Math.max(from, e))
        fromIsDoor = true
      }
      piece(from, length, fromIsDoor, false)
    }
  }
  return blockers
}

// Moves by `move`, then pushes the player out of every wall band along its normal, which makes contact
// slide along walls. Several passes let corners (two bands at once) settle.
export function stepPlayer(position: Point, move: Point, blockers: Blocker[]): Point {
  let p = { x: position.x + move.x, y: position.y + move.y }
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    let pushed = false
    for (const bl of blockers) {
      const { point: c } = closest(p, bl.a, bl.b)
      const min = bl.halfWidth + PLAYER_RADIUS_M
      const dx = p.x - c.x
      const dy = p.y - c.y
      const distance = Math.hypot(dx, dy)
      if (distance >= min) continue
      if (distance > 1e-9) {
        p = { x: c.x + (dx / distance) * min, y: c.y + (dy / distance) * min }
      } else {
        // Exactly on the centreline: push back towards the side the player came from.
        const sx = bl.b.x - bl.a.x
        const sy = bl.b.y - bl.a.y
        const len = Math.hypot(sx, sy) || 1
        let nx = -sy / len
        let ny = sx / len
        if ((position.x - c.x) * nx + (position.y - c.y) * ny < 0) { nx = -nx; ny = -ny }
        p = { x: c.x + nx * min, y: c.y + ny * min }
      }
      pushed = true
    }
    if (!pushed) break
  }
  return p
}

export function spawnPoint(rooms: Room[], walls: Wall[]): Point {
  if (rooms.length > 0) {
    const largest = rooms.reduce((best, r) => (polygonArea(r.points) > polygonArea(best.points) ? r : best))
    return polygonCentroid(largest.points)
  }
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return { x: 0, y: 0 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}
