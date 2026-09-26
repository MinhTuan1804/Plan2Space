import { Point, Room, Wall } from '../../../services/geometryService'
import { levelOf } from '../../../lib/levels'
import { pointInPolygon, polygonCentroid } from '../../../lib/planGeometry'
import { isLightWellName, isStairName } from '../../../lib/roomTypes'

export const SLAB_THICKNESS_M = 0.15
export const RAILING_HEIGHT_M = 1.0
const WALL_COVER_SLACK_M = 0.05
const RAILING_SAMPLES_PER_M = 20

// Two rooms are the same shaft when each one's centre lies in the other.
// ponytail: centre test instead of a 50 % area overlap; clip polygons if shafts ever come out oddly shaped.
const sameShaft = (a: Room, b: Room) =>
  pointInPolygon(polygonCentroid(a.points), b.points) && pointInPolygon(polygonCentroid(b.points), a.points)

// A named room with a room of the storey above over its centre: the stair or light well rises into it.
// The room above may be wider (a stair opening into a corridor); only the well itself is open.
function shafts(rooms: Room[], level: number, named: (label: string) => boolean): Room[] {
  const above = rooms.filter((r) => levelOf(r) === level + 1)
  return rooms.filter((r) => levelOf(r) === level && named(r.label)
    && above.some((u) => pointInPolygon(polygonCentroid(r.points), u.points)))
}

export const stairWells = (rooms: Room[], level: number) => shafts(rooms, level, isStairName)
export const lightWells = (rooms: Room[], level: number) => shafts(rooms, level, isLightWellName)

// The openings in `level`'s floor: the stair and light wells of the storey below.
export function holeRooms(rooms: Room[], level: number): Room[] {
  if (level < 1) return []
  return [...stairWells(rooms, level - 1), ...lightWells(rooms, level - 1)]
}

// A room standing exactly over a well is the well itself: open, no floor.
export const isShaft = (r: Room, holes: Room[]) => holes.some((h) => sameShaft(r, h))

// The wells to cut out of a room's floor: those whose centre lies in it (none when the room is the well).
export const holesIn = (r: Room, holes: Room[]): Point[][] => isShaft(r, holes) ? []
  : holes.filter((h) => pointInPolygon(polygonCentroid(h.points), r.points)).map((h) => h.points)

// The slab under `upperLevel`: its rooms (less the wells themselves), open over the wells below.
export function slabOutline(rooms: Room[], upperLevel: number): { outer: Point[][]; holes: Point[][] } {
  const holes = holeRooms(rooms, upperLevel)
  const upper = rooms.filter((r) => levelOf(r) === upperLevel && !isShaft(r, holes))
  return { outer: upper.map((r) => r.points), holes: holes.map((r) => r.points) }
}

function distanceToWall(p: Point, w: Wall): number {
  let best = Infinity
  for (let i = 0; i < w.points.length - 1; i++) {
    const a = w.points[i], b = w.points[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy))
  }
  return best
}

// Stretches of a hole's edge with no wall standing on them: where someone could fall through.
export function railingRuns(hole: Point[], walls: Wall[]): [Point, Point][] {
  const runs: [Point, Point][] = []
  const pts = hole[0].x === hole[hole.length - 1].x && hole[0].y === hole[hole.length - 1].y ? hole.slice(0, -1) : hole
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * RAILING_SAMPLES_PER_M))
    const at = (k: number) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
    let start: number | null = null
    for (let k = 0; k < n; k++) {
      const mid = at(k + 0.5)
      const open = !walls.some((w) => distanceToWall(mid, w) <= w.thicknessMeters / 2 + WALL_COVER_SLACK_M)
      if (open && start === null) start = k
      if ((!open || k === n - 1) && start !== null) {
        runs.push([at(start), at(open ? k + 1 : k)])
        start = null
      }
    }
  }
  return runs
}
