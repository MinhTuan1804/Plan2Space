import { describe, it, expect } from 'vitest'
import { stairWells, lightWells, slabOutline, railingRuns } from '../src/components/studio/Viewer3D/slabs'
import { floorPatches } from '../src/components/studio/Viewer3D/floorPlan'
import { Room, Wall } from '../src/services/geometryService'

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
