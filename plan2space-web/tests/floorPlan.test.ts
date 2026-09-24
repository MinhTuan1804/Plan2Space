import { describe, it, expect } from 'vitest'
import { floorMaterialFor, floorPatches, shadowFrame, wallHeight } from '../src/components/studio/Viewer3D/floorPlan'
import { floorTexture } from '../src/components/studio/Viewer3D/textures'
import { Room, Wall } from '../src/services/geometryService'

const room = (id: string, w: number, h: number): Room =>
  ({ id, label: id, version: 1, points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }, { x: 0, y: 0 }] })
const wall = (a: [number, number], b: [number, number], height = 2.8): Wall =>
  ({ id: `${a}-${b}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: height, version: 1 })

describe('floors', () => {
  it('a room under 6 m² is tiled, any other is wood', () => {
    expect(floorMaterialFor(4.8)).toBe('tile')
    expect(floorMaterialFor(6)).toBe('wood')
    expect(floorMaterialFor(24)).toBe('wood')
  })

  it('each room becomes a floor patch of its own material', () => {
    const patches = floorPatches([room('wc', 2, 2), room('bed', 4, 4)], [])
    expect(patches.map((p) => p.kind)).toEqual(['tile', 'wood'])
  })

  it('with walls but no rooms, one wood floor spans the walls', () => {
    const [patch, ...rest] = floorPatches([], [wall([0, 0], [8, 0]), wall([8, 0], [8, 5])])
    expect(rest).toHaveLength(0)
    expect(patch.kind).toBe('wood')
    expect(patch.points).toEqual([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 5 }, { x: 0, y: 5 }])
  })

  it('an empty plan has no floor', () => {
    expect(floorPatches([], [])).toEqual([])
  })

  it('ceilings sit at the tallest wall, 2.8 m by default', () => {
    expect(wallHeight([wall([0, 0], [1, 0], 2.6), wall([1, 0], [2, 0], 3)])).toBe(3)
    expect(wallHeight([])).toBe(2.8)
  })

  it('without a 2D canvas context textures fall back to plain colours', () => {
    // tests/setup.ts gives jsdom a fake 2D context for Konva; take it away to see the fallback.
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof original
    try {
      expect(floorTexture('wood')).toBeNull()
    } finally {
      HTMLCanvasElement.prototype.getContext = original
    }
  })

  it('the sun casts shadows over the whole house, not just 5 m around the origin', () => {
    // Review finding: three's default shadow box is ±5 m, so a 9 × 11 m house lost its shadows at the edge.
    const frame = shadowFrame([wall([0, 0], [9, 0]), wall([9, 0], [9, 11])])
    expect(frame.centre).toEqual([4.5, 0, -5.5])                       // world x, y, z (z = −plan y)
    expect(frame.halfSize).toBeGreaterThanOrEqual(Math.hypot(4.5, 5.5))
  })
})
