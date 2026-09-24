import { describe, it, expect, beforeEach } from 'vitest'
import { calibrationFactor, polygonArea, polygonCentroid } from '../src/lib/planGeometry'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('calibration factor', () => {
  it('is the real length over the measured one', () => {
    expect(calibrationFactor(34, 7)).toBeCloseTo(7 / 34)
  })

  it('refuses a line too short to measure, and a real length that is not a positive number', () => {
    expect(calibrationFactor(0, 7)).toBeNull()
    expect(calibrationFactor(0.01, 7)).toBeNull()
    expect(calibrationFactor(5, 0)).toBeNull()
    expect(calibrationFactor(5, -2)).toBeNull()
    expect(calibrationFactor(5, Number.NaN)).toBeNull()
    expect(calibrationFactor(5, Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('polygon helpers', () => {
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }]
  it('measures area and centre of a closed ring', () => {
    expect(polygonArea(square)).toBeCloseTo(12)
    expect(polygonCentroid(square)).toEqual({ x: 2, y: 1.5 })
  })
})

describe('scalePlan', () => {
  beforeEach(() => useGeometryStore.setState({
    projectId: 'p', version: 1, dirty: false, wallsEdited: false,
    walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
    openings: [{ id: 'd1', wallId: 'w1', type: 'Door', position: { x: 4, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }],
    rooms: [{ id: 'r1', label: 'Room 1', version: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 0 }] }],
  }))

  it('scales every position about the origin and keeps real-world sizes', () => {
    useGeometryStore.getState().scalePlan(0.5)
    const { walls, openings, rooms, dirty } = useGeometryStore.getState()
    expect(walls[0].points[1]).toEqual({ x: 5, y: 0 })
    expect(walls[0].thicknessMeters).toBe(0.2)
    expect(walls[0].heightMeters).toBe(2.8)
    expect(openings[0].position).toEqual({ x: 2, y: 0 })
    expect(openings[0].widthMeters).toBe(0.9)
    expect(rooms[0].points[2]).toEqual({ x: 5, y: 4 })
    expect(dirty).toBe(true)
  })
})
