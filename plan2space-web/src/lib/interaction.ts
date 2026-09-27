import { Opening, Point, Room, Wall } from '../services/geometryService'
import { DOOR_HEIGHT_M } from '../components/studio/Viewer3D/cutOpenings'
import { interiorPoint } from './planGeometry'

export const DOOR_SWING_S = 0.6
export const GARAGE_ROLL_S = 1.2
const LIGHT_BELOW_CEILING_M = 0.3
const LIGHT_REACH_PER_SIDE = 1.5

// How far open a door is, `elapsed` seconds into a swing of `duration`: eased in and out.
export function doorOpenFraction(elapsedS: number, durationS: number): number {
  const t = Math.min(1, Math.max(0, elapsedS / durationS))
  return t * t * (3 - 2 * t)
}

// A switched light stays as switched; one never touched is on at night.
export const lightOn = (roomId: string, overrides: Map<string, boolean>, night: boolean) => overrides.get(roomId) ?? night

// The ceiling light of a room: plan [x, y, z] within its level, and how far its light carries.
export function roomLight(room: Room, ceilingZ: number): { position: [number, number, number]; distance: number } {
  const c = interiorPoint(room.points)
  const xs = room.points.map((p) => p.x), ys = room.points.map((p) => p.y)
  const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  return { position: [c.x, c.y, ceilingZ - LIGHT_BELOW_CEILING_M], distance: LIGHT_REACH_PER_SIDE * side }
}

// The door the walker looks at: the nearest door whose opening (its width along its wall, from its sill up to
// door height) the line of sight crosses within `maxM`. Eye and openings are in one level's plan, h from its floor.
export function doorInSight(eye: { x: number; y: number; h: number }, look: { x: number; y: number; h: number },
                            openings: Opening[], walls: Wall[], maxM = 2.5): string | null {
  const len = Math.hypot(look.x, look.y, look.h)
  if (len === 0) return null
  const d = { x: look.x / len, y: look.y / len, h: look.h / len }
  let best: { id: string; t: number } | null = null
  for (const o of openings) {
    if (o.type !== 'Door') continue
    const wall = walls.find((w) => w.id === o.wallId)
    const seg = wall && nearestSegment(wall.points, o.position)
    if (!seg) continue
    const u = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y }
    const ul = Math.hypot(u.x, u.y)
    const n = { x: -u.y / ul, y: u.x / ul }
    const facing = n.x * d.x + n.y * d.y
    if (Math.abs(facing) < 1e-9) continue                         // looking along the wall
    const t = (n.x * (o.position.x - eye.x) + n.y * (o.position.y - eye.y)) / facing
    if (t <= 0 || t > maxM || (best && t >= best.t)) continue
    const hit = { x: eye.x + d.x * t, y: eye.y + d.y * t, h: eye.h + d.h * t }
    const along = ((hit.x - o.position.x) * u.x + (hit.y - o.position.y) * u.y) / ul
    if (Math.abs(along) > o.widthMeters / 2 || hit.h < o.sillHeightMeters || hit.h > o.sillHeightMeters + DOOR_HEIGHT_M) continue
    best = { id: o.id, t }
  }
  return best?.id ?? null
}

function nearestSegment(points: Point[], p: Point): { a: Point; b: Point } | null {
  let best: { a: Point; b: Point; d: number } | null = null
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
    if (l2 === 0) continue
    const s = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    const d = Math.hypot(p.x - a.x - s * dx, p.y - a.y - s * dy)
    if (!best || d < best.d) best = { a, b, d }
  }
  return best
}

// One frame of a door's swing: where it has got to, and whether its pose needs setting (once at rest, then only
// while it moves; a door standing still costs nothing).
export function swingStep(elapsed: number, open: boolean, delta: number, durationS: number, applied: boolean) {
  const next = Math.min(durationS, Math.max(0, elapsed + (open ? delta : -delta)))
  return { elapsed: next, apply: !applied || next !== elapsed }
}

// The rooms given one of a fixed number of point lights: three.js compiles the light count into every shader,
// so a count that never changes means switching a light never stalls. The storey on view first, then larger
// rooms; empty slots are null (their light stays mounted at zero intensity).
export function lightPool(litRooms: Room[], focusLevel: number, size: number): (Room | null)[] {
  const area = (r: Room) => {
    const xs = r.points.map((p) => p.x), ys = r.points.map((p) => p.y)
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
  }
  const ranked = [...litRooms].sort((a, b) =>
    Number((b.level ?? 0) === focusLevel) - Number((a.level ?? 0) === focusLevel) || area(b) - area(a))
  return Array.from({ length: size }, (_, i) => ranked[i] ?? null)
}
