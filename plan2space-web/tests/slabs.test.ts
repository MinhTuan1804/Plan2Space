import { describe, it, expect } from 'vitest'
import { stairWells, lightWells, slabOutline, railingRuns, floorPieces, holeRooms, upperExit } from '../src/components/studio/Viewer3D/slabs'
import { floorPatches } from '../src/components/studio/Viewer3D/floorPlan'
import { Room, Wall } from '../src/services/geometryService'
import { polygonArea } from '../src/lib/planGeometry'

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
const room = (id: string, label: string, level: number, pts: Room['points']): Room => ({ id, label, level, version: 1, points: pts })
const wall = (a: [number, number], b: [number, number], level = 1): Wall =>
  ({ id: `${a}-${b}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.11, heightMeters: 3.5, version: 1, level })

// The merged reference house (parts of it): the stair well and two light wells sit at the same place on both floors.
const rooms: Room[] = [
  room('s0', 'STAIRS', 0, box(0, 5.8, 2.8, 9.6)), room('s1', 'STAIRS', 1, box(0, 5.8, 2.8, 9.6)),
  room('l10', 'LIGHT WELL 1', 0, box(4.4, 8.4, 6.4, 9.6)), room('l11', 'LIGHT WELL 1', 1, box(4.4, 8.4, 6.4, 9.6)),
  room('l20', 'GIẾNG TRỜI 2', 0, box(0, 9.6, 1.9, 11)), room('l21', 'LIGHT WELL 2', 1, box(0, 9.6, 1.9, 11)),
  room('lv', 'LIVING ROOM', 0, box(3.4, 0, 10, 5.8)), room('bd', 'BEDROOM 3', 1, box(0, 0, 3.4, 5.8)),
]

describe('slabs and wells', () => {
  it('finds the stair well and both light wells on the ground floor', () => {
    expect(stairWells(rooms, 0).map((r) => r.id)).toEqual(['s0'])
    expect(lightWells(rooms, 0).map((r) => r.id).sort()).toEqual(['l10', 'l20'])
    expect(stairWells(rooms, 1)).toEqual([])      // nothing above the top floor
  })

  it('the first-floor slab covers its rooms and leaves the three wells open', () => {
    const slab = slabOutline(rooms, 1)
    expect(slab.holes).toHaveLength(3)
    expect(slab.outer).toHaveLength(1)            // BEDROOM 3; the well rooms are holes, not slab
  })

  it('railings run only along hole edges that have no wall', () => {
    const well = box(4.4, 8.4, 6.4, 9.6)
    const allWalls = [wall([4.4, 8.4], [6.4, 8.4]), wall([6.4, 8.4], [6.4, 9.6]), wall([6.4, 9.6], [4.4, 9.6]), wall([4.4, 9.6], [4.4, 8.4])]
    expect(railingRuns(well, allWalls)).toEqual([])
    const runs = railingRuns(well, allWalls.slice(0, 3))  // the west side is open
    expect(runs).toHaveLength(1)
    const [[a, b]] = runs
    expect(a.x).toBeCloseTo(4.4); expect(b.x).toBeCloseTo(4.4)
    // 1.2 m side, less the neighbouring walls standing over its two ends
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(0.9); expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1.2)
  })

  it('a light well on the ground floor gets a pebble floor', () => {
    expect(floorPatches([rooms[2]], []).map((f) => f.kind)).toEqual(['pebble'])
  })
})

// The real merged house: upstairs the stair well opens into a wider "STAIRS / CORRIDOR LONG" room.
describe('a stair well under a wider room', () => {
  const real: Room[] = [
    room('s0', 'STAIRS', 0, box(0, 5.8, 2.8, 9.6)),
    room('c1', 'STAIRS / CORRIDOR LONG', 1, box(0, 5.8, 6.4, 9.6)),
    room('b1', 'BEDROOM 3', 1, box(0, 0, 3.4, 5.8)),
  ]
  it('is still a stair well', () => {
    expect(stairWells(real, 0).map((r) => r.id)).toEqual(['s0'])
  })
  it('opens only the well in the slab; the corridor keeps its floor', () => {
    const slab = slabOutline(real, 1)
    expect(slab.holes).toEqual([real[0].points])
    expect(slab.outer).toHaveLength(2)
  })
  it('the corridor floor is the room less the well, even where the well touches its edge', () => {
    const pieces = floorPieces(real[1], holeRooms(real, 1))
    const area = pieces.reduce((a, [outer, ...inner]) => a + polygonArea(outer) - inner.reduce((b, h) => b + polygonArea(h), 0), 0)
    expect(area).toBeCloseTo(6.4 * 3.8 - 2.8 * 3.8, 3)
    expect(floorPieces(real[2], holeRooms(real, 1))).toHaveLength(1)   // a room away from the well is whole
  })
  it('an L-shaped corridor whose centre falls in the well keeps its floor', () => {
    const l = room('cl', 'STAIRS / CORRIDOR LONG', 1, [{ x: 0, y: 5.8 }, { x: 6.4, y: 5.8 }, { x: 6.4, y: 6.9 }, { x: 4.4, y: 6.9 },
      { x: 4.4, y: 9.6 }, { x: 0, y: 9.6 }, { x: 0, y: 5.8 }])
    const holes = holeRooms([real[0], l], 1)
    const area = floorPieces(l, holes).reduce((a, [o, ...i]) => a + polygonArea(o) - i.reduce((b, h) => b + polygonArea(h), 0), 0)
    expect(area).toBeCloseTo(polygonArea(l.points) - 2.8 * 3.8, 3)
  })
})

describe('the way out at the top of a stair', () => {
  const rooms: Room[] = [
    room('s0', 'STAIRS', 0, box(0, 5.8, 2.8, 9.6)),
    room('c1', 'STAIRS / CORRIDOR LONG', 1, box(0, 5.8, 6.4, 9.6)),
    room('b1', 'BEDROOM 3', 1, box(0, 0, 3.4, 5.8)),
  ]
  const walls = [wall([0, 5.8], [6.4, 5.8]), wall([2.8, 6.8], [2.8, 9.6])]
  const ok = upperExit(rooms, walls, 0)
  it('onto the corridor floor where no wall stands between', () => {
    expect(ok({ x: 2.2, y: 6 }, { x: 3.1, y: 6 })).toBe(true)
  })
  it('not through a wall, not into the well, not off the building', () => {
    expect(ok({ x: 2.2, y: 6 }, { x: 2.2, y: 5.5 })).toBe(false)     // the bedroom wall
    expect(ok({ x: 2.2, y: 7.5 }, { x: 3.1, y: 7.5 })).toBe(false)   // the well's east wall upstairs
    expect(ok({ x: 0.6, y: 6 }, { x: 1.4, y: 7 })).toBe(false)       // still over the well
    expect(ok({ x: 0.6, y: 6 }, { x: -0.3, y: 6 })).toBe(false)      // outside
  })
})
