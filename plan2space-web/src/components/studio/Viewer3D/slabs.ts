import polygonClipping from 'polygon-clipping'
import { Point, Room, Wall } from '../../../services/geometryService'
import { levelOf } from '../../../lib/levels'
import { pointInPolygon, polygonArea, polygonCentroid } from '../../../lib/planGeometry'
import { isLightWellName, isStairName } from '../../../lib/roomTypes'

export const SLAB_THICKNESS_M = 0.15
export const RAILING_HEIGHT_M = 1.0
const WALL_COVER_SLACK_M = 0.05
const RAILING_SAMPLES_PER_M = 20


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

const MIN_PIECE_M2 = 0.05   // what clipping leaves of a room drawn exactly over a well: rounding slivers

// A room's floor less every well below it: polygons as [outer ring, ...inner rings]. Clipped, not
// triangulated with holes: a well touching the room's edge breaks three's hole triangulation.
export function floorPieces(r: Room, holes: Room[]): Point[][][] {
  if (holes.length === 0) return [[r.points]]
  const ring = (ps: Point[]): [number, number][] => ps.map((p) => [p.x, p.y])
  return polygonClipping.difference([ring(r.points)], ...holes.map((h) => [ring(h.points)]))
    .map((poly) => poly.map((rg) => rg.map(([x, y]) => ({ x, y }))))
    .filter(([outer]) => polygonArea(outer) >= MIN_PIECE_M2)
}

// A room standing over a well with nothing left once the well is cut out is the well itself: open.
export const isShaft = (r: Room, holes: Room[]) => holes.length > 0 && floorPieces(r, holes).length === 0

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

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

// From the top of a stair on `level`, whether a step from `from` to `to` lands on the floor above
// (not in a well, not outside) without passing through one of that floor's walls.
export function upperExit(rooms: Room[], walls: Wall[], level: number): (from: Point, to: Point) => boolean {
  const holes = holeRooms(rooms, level + 1)
  const floors = rooms.filter((r) => levelOf(r) === level + 1).flatMap((r) => floorPieces(r, holes))
  const upper = walls.filter((w) => levelOf(w) === level + 1)
  return (from, to) =>
    floors.some(([outer, ...inner]) => pointInPolygon(to, outer) && !inner.some((h) => pointInPolygon(to, h)))
    && !upper.some((w) => w.points.slice(1).some((q, i) => segmentsCross(from, to, w.points[i], q)))
}
