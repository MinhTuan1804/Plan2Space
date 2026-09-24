import { describe, it, expect } from 'vitest'
import { snapPoint } from '../src/components/studio/Canvas2D/SnapEngine'
import { Wall } from '../src/services/geometryService'

const walls: Wall[] = [
  { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
]

describe('snapPoint', () => {
  it('snaps to a nearby wall endpoint within tolerance', () => {
    const result = snapPoint({ x: 5.02, y: 0.01 }, walls, 'other-wall', { endpointToleranceM: 0.05 })
    expect(result).toEqual({ x: 5, y: 0 })
  })

  it('snaps to the nearest grid point when no endpoint is close', () => {
    const result = snapPoint({ x: 2.03, y: 1.97 }, walls, 'other-wall', { gridSizeM: 0.1, endpointToleranceM: 0.05 })
    expect(result.x).toBeCloseTo(2.0, 5)
    expect(result.y).toBeCloseTo(2.0, 5)
  })

  it('does not snap to the wall being dragged itself', () => {
    const result = snapPoint({ x: 0.02, y: 0.02 }, walls, 'w1', { endpointToleranceM: 0.05, gridSizeM: 0 })
    expect(result).toEqual({ x: 0.02, y: 0.02 })
  })
})
