import { describe, it, expect } from 'vitest'
import { fitView } from '../src/components/studio/Canvas2D/canvasTransform'
import { Wall } from '../src/services/geometryService'

const wall = (points: [number, number][]): Wall =>
  ({ id: String(Math.random()), points: points.map(([x, y]) => ({ x, y })), thicknessMeters: 0.2, heightMeters: 2.8, version: 1 })

describe('fitView', () => {
  it('centres the whole plan in the viewport with a margin', () => {
    // 10m x 8m plan, all at positive y (drawn above the screen origin once y is flipped).
    const view = fitView([wall([[0, 0], [10, 0], [10, 8], [0, 8], [0, 0]])], { width: 800, height: 600 })

    // Every corner must land inside the viewport.
    for (const [x, y] of [[0, 0], [10, 8]]) {
      const sx = view.x + x * 50 * view.scale
      const sy = view.y - y * 50 * view.scale
      expect(sx).toBeGreaterThan(0); expect(sx).toBeLessThan(800)
      expect(sy).toBeGreaterThan(0); expect(sy).toBeLessThan(600)
    }
    // Centre of the plan maps to the centre of the viewport.
    expect(view.x + 5 * 50 * view.scale).toBeCloseTo(400, 3)
    expect(view.y - 4 * 50 * view.scale).toBeCloseTo(300, 3)
  })

  it('returns the default view when there is nothing to fit', () => {
    expect(fitView([], { width: 800, height: 600 })).toEqual({ scale: 1, x: 80, y: 520 })
  })
})
