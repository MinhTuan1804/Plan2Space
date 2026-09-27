// Stage 2 of the recognition benchmark: stairs, floor merge and upper floor, scored with the web's own code.
import polygonClipping from 'polygon-clipping'
import { Opening, Point, Room, Wall } from '../../src/services/geometryService'
import { levelOf, mergeFloors, planMerge, PlanData } from '../../src/lib/levels'
import { polygonArea, pointInPolygon } from '../../src/lib/planGeometry'
import { floorPieces, holeRooms, stairWells } from '../../src/components/studio/Viewer3D/slabs'
import { stairFor } from '../../src/components/studio/Viewer3D/StairModel'

type XY = [number, number]
export interface Truth {
  levels?: {
    offset: XY; heights: [number, number]; stairWell: XY[]; lightWells: XY[][]
    stairEntry: XY; stairExit: XY[]; upperFloorArea: number
  }
}
// The pipeline's save body (stage 1's out/<case>.json).
export interface Result {
  walls: { id: string; points: Point[]; thicknessMeters: number; heightMeters: number }[]
  rooms: { id: string; points: Point[]; label: string }[]
  openings: { wallId: string; type: string; position: Point; widthMeters: number; sillHeightMeters: number }[]
}

const MERGE_OFFSET_M = 0.1
const FLOOR_OK_M2 = 0.5
const FLOOR_ZERO_M2 = 5
const WELL_IOU = 0.85
const EXIT_REACH_M = 0.3

const pts = (xy: XY[]): Point[] => xy.map(([x, y]) => ({ x, y }))
const ring = (ps: Point[]): [number, number][] => ps.map((p) => [p.x, p.y])
const area = (mp: [number, number][][][]) =>
  mp.reduce((a, [outer, ...inner]) => a + Math.abs(polygonArea(outer.map(([x, y]) => ({ x, y }))))
    - inner.reduce((b, h) => b + Math.abs(polygonArea(h.map(([x, y]) => ({ x, y })))), 0), 0)

export function toPlan(result: Result): PlanData {
  return {
    walls: result.walls.map((w): Wall => ({ ...w, version: 1 })),
    rooms: result.rooms.map((r): Room => ({ ...r, version: 1 })),
    // The pipeline says door/window; the web says Door/Window.
    openings: result.openings.map((o, i): Opening => ({
      id: `o${i}`, wallId: o.wallId, type: o.type.toLowerCase() === 'window' ? 'Window' : 'Door',
      position: o.position, widthMeters: o.widthMeters, sillHeightMeters: o.sillHeightMeters, version: 1,
    })),
    furniture: [],
  }
}

function merged(plan: PlanData, truth: Truth): { plan: PlanData; offsetError: number } | null {
  const m = planMerge(plan.walls)
  if (!m || !truth.levels) return null
  const [dx, dy] = truth.levels.offset
  return { plan: mergeFloors(plan, m, truth.levels.heights), offsetError: Math.hypot(m.offset.x - dx, m.offset.y - dy) }
}

export function scoreMerge(plan: PlanData, truth: Truth): number {
  const m = merged(plan, truth)
  return m && m.offsetError <= MERGE_OFFSET_M ? 100 : 0
}

export function scoreUpperFloor(plan: PlanData, truth: Truth): number {
  const m = merged(plan, truth)
  if (!m) return 0
  const holes = holeRooms(m.plan.rooms, 1)
  const floor = m.plan.rooms.filter((r) => levelOf(r) === 1).flatMap((r) => floorPieces(r, holes))
    .reduce((a, [outer, ...inner]) => a + Math.abs(polygonArea(outer)) - inner.reduce((b, h) => b + Math.abs(polygonArea(h)), 0), 0)
  const diff = Math.abs(floor - truth.levels!.upperFloorArea)
  return diff <= FLOOR_OK_M2 ? 100 : Math.max(0, (100 * (FLOOR_ZERO_M2 - diff)) / (FLOOR_ZERO_M2 - FLOOR_OK_M2))
}

// Half for finding the stair well, a quarter each for a clear door and a way out at the top.
export function scoreStair(plan: PlanData, truth: Truth): number {
  const m = merged(plan, truth)
  if (!m) return 0
  const lv = truth.levels!
  const want = ring(pts(lv.stairWell))
  const iou = (r: Room) => {
    const inter = area(polygonClipping.intersection([ring(r.points)], [want]))
    const union = area(polygonClipping.union([ring(r.points)], [want]))
    return union ? inter / union : 0
  }
  const well = stairWells(m.plan.rooms, 0).map((r) => ({ r, iou: iou(r) })).sort((a, b) => b.iou - a.iou)[0]
  if (!well || well.iou < WELL_IOU) return 0
  const { walls, rooms, openings } = m.plan
  const stair = stairFor(well.r, 0, walls, rooms, openings)
  const h = stair.surfaceHeight({ x: lv.stairEntry[0], y: lv.stairEntry[1] })
  const doorClear = h === null || h <= 0.6 || h >= 2.3
  const top = stair.treads.reduce((a, b) => (a.top > b.top ? a : b))
  const exit = pts(lv.stairExit)
  const reach = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ux, uy]) => ({
    x: top.x + ux * (top.w / 2 + EXIT_REACH_M), y: top.y + uy * (top.d / 2 + EXIT_REACH_M) }))
  const exits = reach.some((p) => pointInPolygon(p, exit))
  return 50 + (doorClear ? 25 : 0) + (exits ? 25 : 0)
}
