import { describe, it, expect } from 'vitest'
import { groundAt, levelForHeight, MAX_STEP_M, WalkLevels } from '../src/lib/walkPhysics'
import { stairGeometry } from '../src/components/studio/Viewer3D/stairs'

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]

// The merged reference house: stair well 2.8 x 3.8 entered from y = 5.8; a light well at (4.4-6.4, 8.4-9.6).
const stair = stairGeometry(box(0, 5.8, 2.8, 9.6), 3.6, { x: 1.4, y: 5.8 })
const world: WalkLevels = {
  elevations: [0, 3.6],
  holes: [[], [box(0, 5.8, 2.8, 9.6), box(4.4, 8.4, 6.4, 9.6)]],
  stairs: [{ level: 0, plan: stair }],
}
const byTop = [...stair.treads].sort((a, b) => a.top - b.top)

describe('walking between levels', () => {
  it('climbs tread by tread', () => {
    let ground = 0
    for (const t of byTop.slice(0, 10)) {
      const next = groundAt({ x: t.x, y: t.y }, ground, world)
      expect(next).toBeCloseTo(t.top, 6)
      ground = next!
    }
  })

  it('from the top tread onto the first floor, and the level follows', () => {
    const top = byTop[byTop.length - 1]
    const onFloor = groundAt({ x: 1.4, y: 3 }, top.top, world)     // just beyond the stair, on level 1
    expect(onFloor).toBeCloseTo(3.6, 6)
    expect(levelForHeight(3.6, world.elevations)).toBe(1)
    expect(levelForHeight(1.9, world.elevations)).toBe(0)
  })

  it('cannot walk off the first floor into the light well', () => {
    expect(groundAt({ x: 5.4, y: 9 }, 3.6, world)).toBeNull()
  })

  it('cannot walk into the stair hole from the first floor except onto the top tread', () => {
    const low = byTop[3]
    expect(groundAt({ x: low.x, y: low.y }, 3.6, world)).toBeNull()
    const top = byTop[byTop.length - 1]
    expect(groundAt({ x: top.x, y: top.y }, 3.6, world)).toBeCloseTo(3.6, 6)
  })

  it('cannot step from the ground floor up onto the second flight', () => {
    const high = byTop[15]
    expect(high.top - 0).toBeGreaterThan(MAX_STEP_M)
    expect(groundAt({ x: high.x, y: high.y }, 0, world)).toBeNull()
  })
})
