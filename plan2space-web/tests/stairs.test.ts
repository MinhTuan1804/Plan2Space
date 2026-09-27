import { describe, it, expect } from 'vitest'
import { stairGeometry, RISER_TARGET_M, FLIGHT_MAX_WIDTH_M } from '../src/components/studio/Viewer3D/stairs'
import { pointInPolygon } from '../src/lib/planGeometry'

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
// The reference stair well: 2.8 x 3.8 m, entered from its bottom (y = 5.8) side.
const well = box(0, 5.8, 2.8, 9.6)

const inside = (t: { x: number; y: number; w: number; d: number }, poly: { x: number; y: number }[]) =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) =>
    pointInPolygon({ x: t.x + (sx * t.w) / 2 * 0.999, y: t.y + (sy * t.d) / 2 * 0.999 }, poly))

describe('generated stair', () => {
  const s = stairGeometry(well, 3.6, { x: 1.4, y: 5.8 })

  it('21 risers of about 171 mm up to the first floor', () => {
    expect(s.treads.length + 1).toBe(21)
    const risers = [...s.treads.map((t) => t.top), s.landing.top].sort((a, b) => a - b)
    expect(risers[0]).toBeCloseTo(3.6 / 21, 3)
    expect(Math.max(...s.treads.map((t) => t.top))).toBeCloseTo(3.6, 6)
    expect(RISER_TARGET_M).toBe(0.17)
  })

  it('fits inside the well with flights at most 1.25 m wide', () => {
    for (const t of [...s.treads, s.landing]) expect(inside(t, well)).toBe(true)
    for (const t of s.treads) expect(Math.min(t.w, t.d)).toBeLessThanOrEqual(0.30 + 1e-9)          // going
    for (const t of s.treads) expect(Math.max(t.w, t.d)).toBeLessThanOrEqual(FLIGHT_MAX_WIDTH_M + 1e-9)
  })

  it('starts at the end the well is entered from, and the surface follows the steps', () => {
    const first = s.treads.reduce((a, b) => (a.top < b.top ? a : b))
    expect(first.y).toBeLessThan(7.7)                                   // near y = 5.8, the entry side
    expect(s.surfaceHeight({ x: first.x, y: first.y })).toBeCloseTo(first.top, 6)
    expect(Math.abs(s.surfaceHeight({ x: s.landing.x, y: s.landing.y })! - 1.8)).toBeLessThanOrEqual(3.6 / 21)
    const top = s.treads.reduce((a, b) => (a.top > b.top ? a : b))
    expect(s.surfaceHeight({ x: top.x, y: top.y })).toBeCloseTo(3.6, 6)
    expect(s.surfaceHeight({ x: 5, y: 5 })).toBeNull()
  })

  it('a narrow well gets flights of half its width', () => {
    const narrow = stairGeometry(box(0, 0, 1.4, 4), 3, null)
    for (const t of narrow.treads) expect(Math.max(t.w, t.d)).toBeCloseTo(0.7, 6)
  })

  it('an L-shaped well keeps the stair inside it', () => {
    const l = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 1.5, y: 4 }, { x: 1.5, y: 5 }, { x: 0, y: 5 }, { x: 0, y: 0 }]
    const st = stairGeometry(l, 3, null)
    for (const t of [...st.treads, st.landing]) expect(inside(t, l)).toBe(true)
  })

  it('flight one runs up the side the door is on', () => {
    // Door on the long side (x = 2.8) near the lower end: tread 1 must be beside it, not across the well.
    const st = stairGeometry(box(0, 0, 2.8, 3.8), 3.6, { x: 2.8, y: 0.5 })
    const first = st.treads.reduce((a, b) => (a.top < b.top ? a : b))
    expect(first.x).toBeGreaterThan(1.4)
    expect(first.y).toBeLessThan(1.9)
  })

  it('no walkable surface where no step is drawn (a long well with capped goings)', () => {
    const st = stairGeometry(box(0, 0, 2.8, 8), 3.0, null)   // goings cap at 0.30 m, flights end well short of the landing
    const top = st.treads.reduce((a, b) => (a.top > b.top ? a : b))
    const lastOfFlightOne = st.treads.filter((t) => t.x < 1.4).reduce((a, b) => (a.top > b.top ? a : b))
    expect(st.surfaceHeight({ x: lastOfFlightOne.x, y: lastOfFlightOne.y + 1.0 })).toBeNull()   // past flight one, before the landing
    expect(st.surfaceHeight({ x: top.x, y: top.y - 1.0 })).toBeNull()                            // past the top tread
  })

  it('the real house: a door mid-way along the well and a way out upstairs only to the east', () => {
    // Upstairs the well opens east into the corridor between y 5.8 and 6.8; everywhere else is wall or outside.
    const exitOk = (from: { x: number; y: number }, to: { x: number; y: number }) =>
      to.x > 2.8 && to.y > 5.8 && to.y < 6.8 && from.x > 1.4
    const st = stairGeometry(box(0, 5.8, 2.8, 9.6), 3.8, { x: 2.8, y: 7 }, exitOk)
    const top = st.treads.reduce((a, b) => (a.top > b.top ? a : b))
    expect(top.x).toBeGreaterThan(1.4)                                  // arrives on the east side
    expect(top.y).toBeLessThan(6.8)                                     // beside the corridor
    const underDoor = st.surfaceHeight({ x: 2.5, y: 7 })
    expect(underDoor === null || underDoor >= 2.3).toBe(true)          // the door is not blocked by low steps
  })
})
