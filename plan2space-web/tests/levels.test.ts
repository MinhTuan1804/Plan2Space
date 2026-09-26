import { describe, it, expect } from 'vitest'
import { findBlocks, planMerge, mergeFloors, levelElevation, levelOf, PlanData } from '../src/lib/levels'
import { Wall, Room, Opening, FurnitureItem } from '../src/services/geometryService'

// The reference two-storey plan: two 10 x 13.6 m houses drawn side by side, 20 m apart.
const rect = (id: string, x0: number, y0: number, x1: number, y1: number, t = 0.22): Wall[] => [
  [[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]],
].map(([a, b], i) => ({ id: `${id}${i}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: t, heightMeters: 3, version: 1 }))
const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]

function plan(): PlanData {
  const walls = [...rect('g', 0, 0, 10, 13.6), ...rect('f', 20, 0, 30, 13.6)]
  const rooms: Room[] = [
    { id: 'rg', label: 'STAIRS', version: 1, points: box(0, 5.8, 2.8, 9.6) },
    { id: 'rf', label: 'STAIRS', version: 1, points: box(20, 5.8, 22.8, 9.6) },
  ]
  const openings: Opening[] = [
    { id: 'og', wallId: 'g0', type: 'Door', position: { x: 4, y: 0 }, widthMeters: 1, sillHeightMeters: 0, version: 1 },
    { id: 'of', wallId: 'f0', type: 'Window', position: { x: 24, y: 0 }, widthMeters: 1, sillHeightMeters: 0.9, version: 1 },
  ]
  const furniture: FurnitureItem[] = [{ id: 'bf', catalogId: 'bed_double', x: 25, y: 3, rotationDeg: 0 }]
  return { walls, rooms, openings, furniture }
}

describe('floor blocks', () => {
  it('finds the two houses, ground floor on the left, 20 m apart', () => {
    const p = plan()
    expect(findBlocks(p.walls)).toHaveLength(2)
    const m = planMerge(p.walls)!
    expect(m.lower.bounds.minX).toBeCloseTo(0)
    expect(m.offset.x).toBeCloseTo(-20); expect(m.offset.y).toBeCloseTo(0)
    expect(m.sizeMismatch).toBe(false)
  })

  it('no merge for a single house or an already merged plan', () => {
    expect(planMerge(rect('g', 0, 0, 10, 13.6))).toBeNull()
    const merged = mergeFloors(plan(), planMerge(plan().walls)!, [3.6, 3.5])
    expect(planMerge(merged.walls)).toBeNull()
  })

  it('flags blocks of very different size', () => {
    const walls = [...rect('g', 0, 0, 10, 13.6), ...rect('s', 20, 0, 25, 8)]   // 136 vs 40 m2
    expect(planMerge(walls)!.sizeMismatch).toBe(true)
  })

  it('ignores specks under 20 m2', () => {
    expect(findBlocks([...rect('g', 0, 0, 10, 13.6), ...rect('s', 20, 0, 23, 3)])).toHaveLength(1)
  })
})

describe('mergeFloors', () => {
  it('moves the upper house onto the lower one as level 1, with storey heights', () => {
    const p = mergeFloors(plan(), planMerge(plan().walls)!, [3.6, 3.5])
    const upper = p.walls.find((w) => w.id === 'f0')!
    expect(upper.points[0].x).toBeCloseTo(0); expect(levelOf(upper)).toBe(1); expect(upper.heightMeters).toBe(3.5)
    const lower = p.walls.find((w) => w.id === 'g0')!
    expect(lower.points[0].x).toBeCloseTo(0); expect(levelOf(lower)).toBe(0); expect(lower.heightMeters).toBe(3.6)
    expect(p.rooms.find((r) => r.id === 'rf')!.points[0].x).toBeCloseTo(0)
    expect(levelOf(p.rooms.find((r) => r.id === 'rf')!)).toBe(1)
    const window = p.openings.find((o) => o.id === 'of')!
    expect(window.position.x).toBeCloseTo(4); expect(levelOf(window)).toBe(1)
    const bed = p.furniture.find((f) => f.id === 'bf')!
    expect(bed.x).toBeCloseTo(5); expect(levelOf(bed)).toBe(1)
    expect(levelElevation(p.walls, 0)).toBe(0)
    expect(levelElevation(p.walls, 1)).toBeCloseTo(3.6)
  })
})
