import { describe, it, expect } from 'vitest'
import { levelScene, levelElevation, PlanData } from '../src/lib/levels'
import { wallEndExtensions } from '../src/components/studio/Viewer3D/wallJoints'
import { Wall } from '../src/services/geometryService'

const wall = (id: string, a: [number, number], b: [number, number], level: number, h = 3): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: h, version: 1, level })

const plan: PlanData = {
  walls: [wall('g1', [0, 0], [5, 0], 0, 3.6), wall('g2', [5, 0], [5, 4], 0, 3.6), wall('f1', [0, 0], [5, 0], 1, 3.5)],
  rooms: [{ id: 'r0', label: 'a', version: 1, level: 0, points: [] }, { id: 'r1', label: 'b', version: 1, level: 1, points: [] }],
  openings: [{ id: 'o1', wallId: 'f1', type: 'Door', position: { x: 2, y: 0 }, widthMeters: 1, sillHeightMeters: 0, version: 1, level: 1 }],
  furniture: [{ id: 'b', catalogId: 'bed_double', x: 1, y: 1, rotationDeg: 0, level: 0 }],
}

describe('levels in 3D', () => {
  it('a level scene holds only that level', () => {
    const up = levelScene(plan, 1)
    expect(up.walls.map((w) => w.id)).toEqual(['f1'])
    expect(up.rooms.map((r) => r.id)).toEqual(['r1'])
    expect(up.openings).toHaveLength(1)
    expect(up.furniture).toHaveLength(0)
  })

  it("a level's walls join only with walls of that level", () => {
    // f1 ends over g2 (level 0): joined across levels it would be stretched into the floor below.
    const up = levelScene(plan, 1)
    expect(wallEndExtensions(up.walls[0], up.walls)).toEqual([0, 0])
  })

  it('level 1 stands on the ground storey', () => {
    expect(levelElevation(plan.walls, 0)).toBe(0)
    expect(levelElevation(plan.walls, 1)).toBeCloseTo(3.6)
  })
})
