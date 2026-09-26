import { FurnitureItem, Opening, Point, Room, Wall } from '../services/geometryService'
import { polygonCentroid } from './planGeometry'

export interface PlanData { walls: Wall[]; rooms: Room[]; openings: Opening[]; furniture: FurnitureItem[] }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface Block { wallIds: string[]; bounds: Bounds }
export interface MergePlan { lower: Block; upper: Block; offset: Point; sizeMismatch: boolean }

const BLOCK_GAP_M = 0.5          // walls this close (slab to slab) belong to one house
const MIN_BLOCK_AREA_M2 = 20

export const levelOf = (x: { level?: number }): number => x.level ?? 0
export const levelsIn = (walls: Wall[]): number[] => [...new Set(walls.map(levelOf))].sort((a, b) => a - b)

function pointSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

function wallDistance(u: Wall, v: Wall): number {
  let best = Infinity
  for (let i = 0; i < u.points.length - 1; i++) {
    for (let j = 0; j < v.points.length - 1; j++) {
      const [a, b, c, d] = [u.points[i], u.points[i + 1], v.points[j], v.points[j + 1]]
      if (crosses(a, b, c, d)) return 0
      best = Math.min(best, pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b))
    }
  }
  return best - u.thicknessMeters / 2 - v.thicknessMeters / 2
}

function boundsOf(walls: Wall[]): Bounds {
  const pts = walls.flatMap((w) => w.points)
  return { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
           maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) }
}
const area = (b: Bounds) => (b.maxX - b.minX) * (b.maxY - b.minY)
const inside = (p: Point, b: Bounds) => p.x >= b.minX - BLOCK_GAP_M && p.x <= b.maxX + BLOCK_GAP_M
  && p.y >= b.minY - BLOCK_GAP_M && p.y <= b.maxY + BLOCK_GAP_M

// Groups of walls that touch (or nearly), largest first; specks under 20 m2 are dropped.
// ponytail: O(n²) wall pairs, fine for a house plan; a grid index if plans reach thousands of walls.
export function findBlocks(walls: Wall[]): Block[] {
  const parent = walls.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++)
      if (find(i) !== find(j) && wallDistance(walls[i], walls[j]) <= BLOCK_GAP_M) parent[find(i)] = find(j)
  const groups = new Map<number, Wall[]>()
  walls.forEach((w, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), w]))
  return [...groups.values()]
    .map((ws) => ({ wallIds: ws.map((w) => w.id), bounds: boundsOf(ws) }))
    .filter((b) => area(b.bounds) >= MIN_BLOCK_AREA_M2)
    .sort((a, b) => area(b.bounds) - area(a.bounds))
}

// Side-by-side floors of one house: the left one is the ground floor; the upper floor is lined up on
// the lower one by their outlines' lower-left corners. Null once merged or with a single house.
export function planMerge(walls: Wall[]): MergePlan | null {
  if (walls.some((w) => levelOf(w) !== 0)) return null
  const blocks = findBlocks(walls)
  if (blocks.length < 2) return null
  const [lower, upper] = [blocks[0], blocks[1]].sort((a, b) => a.bounds.minX - b.bounds.minX)
  return {
    lower, upper,
    offset: bestOffset(walls, lower, upper),
    sizeMismatch: Math.min(area(lower.bounds), area(upper.bounds)) < 0.5 * Math.max(area(lower.bounds), area(upper.bounds)),
  }
}

const END_MATCH_M = 0.05

// Floors share their outline but not always all of it (a balcony juts out upstairs), so try lining up
// each corner of the two outlines and keep the one that lands the most upper wall ends on lower ones.
function bestOffset(walls: Wall[], lower: Block, upper: Block): Point {
  const ends = (ids: string[]) => walls.filter((w) => ids.includes(w.id)).flatMap((w) => [w.points[0], w.points[w.points.length - 1]])
  const below = ends(lower.wallIds), above = ends(upper.wallIds)
  const [l, u] = [lower.bounds, upper.bounds]
  const candidates: Point[] = [
    { x: l.minX - u.minX, y: l.minY - u.minY }, { x: l.maxX - u.maxX, y: l.maxY - u.maxY },
    { x: l.minX - u.minX, y: l.maxY - u.maxY }, { x: l.maxX - u.maxX, y: l.minY - u.minY },
  ]
  const score = (o: Point) => above.filter((p) => below.some((q) => Math.hypot(p.x + o.x - q.x, p.y + o.y - q.y) <= END_MATCH_M)).length
  return candidates.reduce((best, o) => (score(o) > score(best) ? o : best))
}

export function mergeFloors(plan: PlanData, merge: MergePlan, heights: [number, number]): PlanData {
  const up = new Set(merge.upper.wallIds)
  const move = (p: Point) => ({ x: p.x + merge.offset.x, y: p.y + merge.offset.y })
  const onUpper = (p: Point) => inside(p, merge.upper.bounds)
  const walls = plan.walls.map((w) => up.has(w.id)
    ? { ...w, points: w.points.map(move), level: 1, heightMeters: heights[1] }
    : { ...w, level: 0, heightMeters: heights[0] })
  const rooms = plan.rooms.map((r) => onUpper(polygonCentroid(r.points)) ? { ...r, points: r.points.map(move), level: 1 } : { ...r, level: 0 })
  const openings = plan.openings.map((o) => up.has(o.wallId) ? { ...o, position: move(o.position), level: 1 } : { ...o, level: 0 })
  const furniture = plan.furniture.map((f) => onUpper(f) ? { ...f, ...move(f), level: 1 } : { ...f, level: 0 })
  return { walls, rooms, openings, furniture }
}

export function storeyHeight(walls: Wall[], level: number): number {
  const hs = walls.filter((w) => levelOf(w) === level).map((w) => w.heightMeters)
  return hs.length ? Math.max(...hs) : 0
}

export function levelElevation(walls: Wall[], level: number): number {
  let z = 0
  for (let l = 0; l < level; l++) z += storeyHeight(walls, l)
  return z
}


export function levelScene(plan: PlanData, level: number): PlanData {
  const on = <T extends { level?: number }>(xs: T[]) => xs.filter((x) => levelOf(x) === level)
  return { walls: on(plan.walls), rooms: on(plan.rooms), openings: on(plan.openings), furniture: on(plan.furniture) }
}
