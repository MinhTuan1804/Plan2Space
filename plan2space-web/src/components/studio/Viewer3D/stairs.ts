import { Point } from '../../../services/geometryService'
import { pointInPolygon } from '../../../lib/planGeometry'

export const RISER_TARGET_M = 0.17
export const FLIGHT_MAX_WIDTH_M = 1.25
export const HANDRAIL_HEIGHT_M = 0.9
const GOING_MAX_M = 0.30

export interface Point3 { x: number; y: number; z: number }
// A step: box centre in plan, its size along x (w) and y (d), and the height of its top above the level.
export interface Tread { x: number; y: number; w: number; d: number; top: number }
export interface StairPlan {
  treads: Tread[]
  landing: Tread
  handrails: [Point3, Point3][]
  footprint: Point[]
  surfaceHeight(p: Point): number | null
}

interface Rect { x0: number; y0: number; x1: number; y1: number }

// The largest axis-aligned rectangle inside the well, from the well's own vertex coordinates.
function inscribedRect(poly: Point[]): Rect {
  const xs = [...new Set(poly.map((p) => p.x))].sort((a, b) => a - b)
  const ys = [...new Set(poly.map((p) => p.y))].sort((a, b) => a - b)
  const e = 1e-4
  const fits = (r: Rect) => [[r.x0 + e, r.y0 + e], [r.x1 - e, r.y0 + e], [r.x1 - e, r.y1 - e], [r.x0 + e, r.y1 - e],
    [(r.x0 + r.x1) / 2, r.y0 + e], [(r.x0 + r.x1) / 2, r.y1 - e], [r.x0 + e, (r.y0 + r.y1) / 2], [r.x1 - e, (r.y0 + r.y1) / 2]]
    .every(([x, y]) => pointInPolygon({ x, y }, poly))
  let best: Rect = { x0: xs[0], y0: ys[0], x1: xs[0], y1: ys[0] }
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++)
    for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
      const r = { x0: xs[i], x1: xs[j], y0: ys[k], y1: ys[l] }
      if ((r.x1 - r.x0) * (r.y1 - r.y0) > (best.x1 - best.x0) * (best.y1 - best.y0) && fits(r)) best = r
    }
  return best
}

const HEADROOM_M = 2.3          // a door may open under a flight this high above it
const LOW_STEP_M = 0.6          // or straight onto its first three steps
const EXIT_REACH_M = 0.3        // how far past the top tread the way out upstairs is looked for

// Whether one may walk from the top tread (`from`) to a point just past it (`to`) on the floor above.
export type ExitCheck = (from: Point, to: Point) => boolean

// A dog-leg stair: flight one up one side of the well, a landing across the far end, flight two back down
// the other side, arriving at `rise` (the storey height) on the top tread. Of the four ways round it can
// go, the one taken leaves the door (`entry`) clear and arrives where the floor above can be walked onto.
export function stairGeometry(well: Point[], rise: number, entry: Point | null, exitOk?: ExitCheck): StairPlan {
  const r = inscribedRect(well)
  const alongX = r.x1 - r.x0 >= r.y1 - r.y0
  const lowEnd = alongX ? r.x0 : r.y0
  const highEnd = alongX ? r.x1 : r.y1
  const acrossLow = alongX ? r.y0 : r.x0
  const S = alongX ? r.y1 - r.y0 : r.x1 - r.x0
  // The default: start at the end nearest the door, up the side the door is on.
  const fromLow = !entry || Math.abs((alongX ? entry.x : entry.y) - lowEnd) <= Math.abs((alongX ? entry.x : entry.y) - highEnd)
  const flipT = !!entry && (alongX ? entry.y : entry.x) - acrossLow > S / 2
  const layouts = [[fromLow, flipT], [fromLow, !flipT], [!fromLow, flipT], [!fromLow, !flipT]]
    .map(([low, flip]) => dogLeg(r, rise, low, flip))
  const centre = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }
  const score = (st: Built) => {
    let doorClear = true
    if (entry) {
      const d = Math.hypot(centre.x - entry.x, centre.y - entry.y) || 1
      const h = st.plan.surfaceHeight({ x: entry.x + ((centre.x - entry.x) / d) * EXIT_REACH_M, y: entry.y + ((centre.y - entry.y) / d) * EXIT_REACH_M })
      doorClear = h === null || h <= LOW_STEP_M || h >= HEADROOM_M
    }
    const exits = !exitOk || st.exits.some((to) => exitOk(st.top, to))
    return (exits ? 2 : 0) + (doorClear ? 1 : 0)
  }
  return layouts.reduce((best, st) => (score(st) > score(best) ? st : best)).plan
}

interface Built { plan: StairPlan; top: Point; exits: Point[] }

function dogLeg(r: Rect, rise: number, fromLow: boolean, flipT: boolean): Built {
  const alongX = r.x1 - r.x0 >= r.y1 - r.y0
  const L = alongX ? r.x1 - r.x0 : r.y1 - r.y0
  const S = alongX ? r.y1 - r.y0 : r.x1 - r.x0
  const lowEnd = alongX ? r.x0 : r.y0
  const highEnd = alongX ? r.x1 : r.y1
  const acrossLow = alongX ? r.y0 : r.x0
  const toPlan = (s: number, t: number): Point => {
    const along = fromLow ? lowEnd + s : highEnd - s
    const across = acrossLow + (flipT ? S - t : t)
    return alongX ? { x: along, y: across } : { x: across, y: along }
  }
  const toLocal = (p: Point) => {
    const along = alongX ? p.x : p.y
    const t = (alongX ? p.y : p.x) - acrossLow
    return { s: fromLow ? along - lowEnd : highEnd - along, t: flipT ? S - t : t }
  }

  const n = Math.max(2, Math.round(rise / RISER_TARGET_M))
  const h = rise / n
  const a = Math.floor((n - 1) / 2)          // treads in flight one
  const b = n - 1 - a                        // treads in flight two; the landing is the remaining riser
  const fw = Math.min(FLIGHT_MAX_WIDTH_M, S / 2)
  const ld = fw
  // ponytail: a well too short for 0.22 m goings gets steeper steps rather than a stair poking out of it.
  const g = Math.min(GOING_MAX_M, (L - ld) / Math.max(a, b))
  const box = (s: number, t: number, sizeS: number, sizeT: number, top: number): Tread => {
    const c = toPlan(s, t)
    return { ...c, w: alongX ? sizeS : sizeT, d: alongX ? sizeT : sizeS, top }
  }

  const treads: Tread[] = []
  for (let k = 1; k <= a; k++) treads.push(box((k - 0.5) * g, fw / 2, g, fw, k * h))
  for (let j = 1; j <= b; j++) treads.push(box(L - ld - (j - 0.5) * g, S - fw / 2, g, fw, (a + 1 + j) * h))
  const landing = box(L - ld / 2, S / 2, ld, S, (a + 1) * h)
  const at = (s: number, t: number, z: number): Point3 => ({ ...toPlan(s, t), z })
  const handrails: [Point3, Point3][] = [
    [at(0, 0, h + HANDRAIL_HEIGHT_M), at(a * g, 0, a * h + HANDRAIL_HEIGHT_M)],
    [at(L, 0, (a + 1) * h + HANDRAIL_HEIGHT_M), at(L, S, (a + 1) * h + HANDRAIL_HEIGHT_M)],
    [at(L - ld, S, (a + 1) * h + HANDRAIL_HEIGHT_M), at(L - ld - b * g, S, rise + HANDRAIL_HEIGHT_M)],
  ]

  const topS = L - ld - (b - 0.5) * g
  return {
    top: toPlan(topS, S - fw / 2),
    // Off the end of the top tread, or off its outer side.
    exits: [toPlan(topS - g / 2 - EXIT_REACH_M, S - fw / 2), toPlan(topS, S + EXIT_REACH_M)],
    plan: {
      treads, landing, handrails,
      footprint: [toPlan(0, 0), toPlan(L, 0), toPlan(L, S), toPlan(0, S)],
      surfaceHeight(p) {
        const { s, t } = toLocal(p)
        if (s < 0 || s > L || t < 0 || t > S) return null
        if (s >= L - ld) return (a + 1) * h
        // Only where a step is drawn: past either flight (capped goings in a long well) there is no stair.
        if (t <= fw) { const k = Math.floor(s / g) + 1; return k <= a ? k * h : null }
        if (t >= S - fw) { const j = Math.floor((L - ld - s) / g) + 1; return j <= b ? (a + 1 + j) * h : null }
        return null
      },
    },
  }
}
