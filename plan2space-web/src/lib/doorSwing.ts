import { Opening, Point, Room, Wall } from '../services/geometryService'
import { pointInPolygon, polygonArea } from './planGeometry'

// From this width a doorway takes two leaves, hinged on either jamb.
export const DOUBLE_DOOR_MIN_WIDTH_M = 1.2

const PROBE_M = 0.4            // how far either side of the wall the rooms are looked up
const CORRIDOR_GAP = 0.2       // compactness this much lower than the other side marks a corridor

function segmentAt(wall: Wall, p: Point): { u: Point; n: Point } {
  let best = { distance: Infinity, u: { x: 1, y: 0 } }
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i]
    const b = wall.points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    const length = Math.sqrt(lengthSq)
    if (distance < best.distance) best = { distance, u: { x: dx / length, y: dy / length } }
  }
  return { u: best.u, n: { x: -best.u.y, y: best.u.x } }
}

// 1 for a round room, low for a long thin one (a corridor).
function compactness(points: Point[]): number {
  let perimeter = 0
  for (let i = 0; i < points.length - 1; i++) perimeter += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
  return perimeter === 0 ? 0 : (4 * Math.PI * polygonArea(points)) / (perimeter * perimeter)
}

// Which side of its wall a door swings to: +1 along the wall segment's left normal, -1 the other way.
// Into the house from outside, into a room from a corridor, otherwise into the smaller room;
// a door the user flipped goes the other way.
export function doorSwingSign(opening: Opening, wall: Wall, rooms: Room[]): 1 | -1 {
  const { n } = segmentAt(wall, opening.position)
  const at = (s: number) => rooms.find((r) => pointInPolygon(
    { x: opening.position.x + s * n.x * PROBE_M, y: opening.position.y + s * n.y * PROBE_M }, r.points))
  const left = at(1)
  const right = at(-1)
  let sign: 1 | -1 = -1
  if (left && !right) sign = 1
  else if (left && right) {
    const cl = compactness(left.points)
    const cr = compactness(right.points)
    if (Math.abs(cl - cr) >= CORRIDOR_GAP) sign = cl > cr ? 1 : -1
    else sign = polygonArea(left.points) < polygonArea(right.points) ? 1 : -1
  }
  return opening.swingFlipped ? (-sign as 1 | -1) : sign
}

export interface SwingArc { hinge: Point; points: Point[] }

// The plan symbol: a quarter circle from each open leaf back to where it closes. Matches the 3D door:
// a single leaf hangs on the jamb at +sign along the wall, two leaves on both jambs.
export function doorSwingArcs(opening: Opening, wall: Wall, sign: 1 | -1, steps = 12): SwingArc[] {
  const { u, n } = segmentAt(wall, opening.position)
  const p = opening.position
  const w = opening.widthMeters
  const open = { x: sign * n.x, y: sign * n.y }
  const arc = (hinge: Point, radius: number, closed: Point): SwingArc => ({
    hinge,
    points: Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * (Math.PI / 2)
      return { x: hinge.x + radius * (Math.cos(t) * open.x + Math.sin(t) * closed.x),
               y: hinge.y + radius * (Math.cos(t) * open.y + Math.sin(t) * closed.y) }
    }),
  })
  if (w < DOUBLE_DOOR_MIN_WIDTH_M) {
    return [arc({ x: p.x + sign * u.x * w / 2, y: p.y + sign * u.y * w / 2 }, w, { x: -sign * u.x, y: -sign * u.y })]
  }
  return [
    arc({ x: p.x - u.x * w / 2, y: p.y - u.y * w / 2 }, w / 2, u),
    arc({ x: p.x + u.x * w / 2, y: p.y + u.y * w / 2 }, w / 2, { x: -u.x, y: -u.y }),
  ]
}
