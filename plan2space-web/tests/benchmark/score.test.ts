import { describe, it, expect } from 'vitest'
import truth from './fixtures/case11_truth.json'
import { Result, scoreMerge, scoreStair, scoreUpperFloor, toPlan, Truth } from './score'

type T = { walls: { points: number[][]; thickness: number }[]; rooms: { points: number[][]; name: string }[];
  openings: { type: string; centre: number[]; width: number }[] }
// The pipeline's output as it would be if it read the drawing perfectly (moved by dx beyond x0 when given).
function perfect(t: T, move: (x: number, y: number) => [number, number] = (x, y) => [x, y]): Result {
  const p = ([x, y]: number[]) => { const [a, b] = move(x, y); return { x: a, y: b } }
  const walls = t.walls.map((w, i) => ({ id: `w${i}`, points: w.points.map(p), thicknessMeters: w.thickness, heightMeters: 2.8 }))
  return {
    walls,
    rooms: t.rooms.map((r, i) => ({ id: `r${i}`, points: r.points.map(p), label: r.name })),
    openings: t.openings.map((o) => {
      const c = p(o.centre)
      const wall = walls.find((w) => w.points.some((q, k) => k > 0 && Math.abs(
        (w.points[k].x - w.points[k - 1].x) * (c.y - w.points[k - 1].y) - (w.points[k].y - w.points[k - 1].y) * (c.x - w.points[k - 1].x)) < 1e-6
        && c.x >= Math.min(q.x, w.points[k - 1].x) - 1e-6 && c.x <= Math.max(q.x, w.points[k - 1].x) + 1e-6
        && c.y >= Math.min(q.y, w.points[k - 1].y) - 1e-6 && c.y <= Math.max(q.y, w.points[k - 1].y) + 1e-6))!
      return { wallId: wall.id, type: o.type.toLowerCase(), position: c, widthMeters: o.width, sillHeightMeters: 0 }
    }),
  }
}
const t = truth as unknown as T & Truth

describe('stage 2 scoring', () => {
  it('a perfect reading scores full marks on stair, merge and upper floor', () => {
    const plan = toPlan(perfect(t))
    expect(scoreMerge(plan, t)).toBe(100)
    expect(scoreUpperFloor(plan, t)).toBe(100)
    expect(scoreStair(plan, t)).toBe(100)
  })

  it('an upper block drawn 0.2 m off merges wrong', () => {
    const plan = toPlan(perfect(t, (x, y) => (x > 12 ? [x, y + 0.2] : [x, y])))
    expect(scoreMerge(plan, t)).toBe(0)
  })

  it('no stair room upstairs, no stair', () => {
    const r = perfect(t)
    r.rooms = r.rooms.filter((room) => room.label !== 'STAIRS / CORRIDOR')
    expect(scoreStair(toPlan(r), t)).toBe(0)
  })

  it('one block only: nothing to merge, no crash', () => {
    const r = perfect(t)
    r.walls = r.walls.filter((w) => w.points.every((p) => p.x < 12))
    const plan = toPlan(r)
    expect(scoreMerge(plan, t)).toBe(0)
    expect(scoreUpperFloor(plan, t)).toBe(0)
    expect(scoreStair(plan, t)).toBe(0)
  })
})
