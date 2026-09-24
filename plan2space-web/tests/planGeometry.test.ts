import { describe, it, expect } from 'vitest'
import { distanceAlong, nearestOnWalls, newId, pointAlong, polylineLength } from '../src/lib/planGeometry'
import { Wall } from '../src/services/geometryService'

const wall = (id: string, pts: [number, number][]): Wall =>
  ({ id, points: pts.map(([x, y]) => ({ x, y })), thicknessMeters: 0.2, heightMeters: 2.8, version: 0 })

describe('planGeometry', () => {
  it('measures and walks an L-shaped wall', () => {
    const l = wall('l', [[0, 0], [4, 0], [4, 3]]).points
    expect(polylineLength(l)).toBe(7)
    expect(pointAlong(l, 5)).toEqual({ x: 4, y: 1 })
    expect(pointAlong(l, 99)).toEqual({ x: 4, y: 3 })
    expect(distanceAlong(l, { x: 4.2, y: 1 })).toBeCloseTo(5)
  })

  it('finds the closest point on the nearest wall', () => {
    const hit = nearestOnWalls({ x: 2, y: 0.3 }, [wall('a', [[0, 0], [4, 0]]), wall('b', [[0, 5], [4, 5]])])
    expect(hit?.wallId).toBe('a')
    expect(hit?.point).toEqual({ x: 2, y: 0 })
    expect(hit?.distance).toBeCloseTo(0.3)
  })

  it('makes GUIDs', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
