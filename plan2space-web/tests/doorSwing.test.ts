import { describe, it, expect } from 'vitest'
import { doorSwingSign, doorSwingArcs } from '../src/lib/doorSwing'
import { pointInPolygon } from '../src/lib/planGeometry'
import { Opening, Room, Wall } from '../src/services/geometryService'

// The user's imported house (nha_cap4_mat_bang.dxf): Room 3 is the 9 × 1.2 m corridor.
const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
const rooms: Room[] = [
  ['Room 1', box(0, 1.5, 5.5, 6)], ['Room 2', box(5.5, 1.5, 9, 6)], ['Room 3', box(0, 6, 9, 7.2)],
  ['Room 4', box(3.8, 7.2, 5.8, 9.6)], ['Room 5', box(0, 7.2, 3.8, 12)], ['Room 6', box(5.8, 7.2, 9, 12)],
  ['Room 7', box(3.8, 9.6, 5.8, 12)],
].map(([label, points], i) => ({ id: `r${i}`, label: label as string, points: points as Room['points'], version: 1 }))

const door = (x: number, y: number, width: number, wall: Wall, flipped = false): Opening =>
  ({ id: `d${x}${y}`, wallId: wall.id, type: 'Door', position: { x, y }, widthMeters: width, sillHeightMeters: 0, version: 1, swingFlipped: flipped })
const wall = (id: string, a: [number, number], b: [number, number]): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: 3, version: 1 })

const along6 = wall('w6', [0, 6], [9, 6])
const along72 = wall('w72', [9, 7.2], [0, 7.2])        // drawn right to left: the rule must not depend on it
const front = wall('w15', [0, 1.5], [9, 1.5])
const between67 = wall('w58', [5.8, 7.2], [5.8, 12])

function roomSwungInto(o: Opening, w: Wall): string | undefined {
  const sign = doorSwingSign(o, w, rooms)
  const [a, b] = w.points
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  const p = { x: o.position.x + sign * n.x * 0.5, y: o.position.y + sign * n.y * 0.5 }
  return rooms.find((r) => pointInPolygon(p, r.points))?.label
}

describe('door swing: always into the room', () => {
  it.each([
    [2.6, 6.0, 1.2, along6, 'Room 1'],     // bedroom off the corridor: not into the corridor
    [6.45, 6.0, 0.9, along6, 'Room 2'],
    [1.95, 7.2, 0.9, along72, 'Room 5'],
    [4.55, 7.2, 0.7, along72, 'Room 4'],
    [6.65, 7.2, 0.9, along72, 'Room 6'],
    [4.6, 1.5, 1.2, front, 'Room 1'],      // the front door opens into the house
  ])('door at (%s, %s) swings into %s', (x, y, w, wl, expected) => {
    expect(roomSwungInto(door(x, y, w, wl), wl)).toBe(expected)
  })

  it('between two ordinary rooms it swings into the smaller one', () => {
    expect(roomSwungInto(door(5.8, 10.35, 0.7, between67), between67)).toBe('Room 7')
  })

  it('a flipped door swings the other way', () => {
    const o = door(2.6, 6.0, 1.2, along6, true)
    expect(roomSwungInto(o, along6)).toBe('Room 3')
  })
})

describe('door swing arcs on the 2D plan', () => {
  it('one quarter arc for a single leaf: from the open leaf to the far jamb, radius the door width', () => {
    const o = door(2.6, 6.0, 0.9, along6)
    const sign = doorSwingSign(o, along6, rooms)
    const [arc] = doorSwingArcs(o, along6, sign)
    const hinge = arc.hinge
    for (const p of arc.points) expect(Math.hypot(p.x - hinge.x, p.y - hinge.y)).toBeCloseTo(0.9)
    expect(arc.points[arc.points.length - 1].y).toBeCloseTo(6.0)                       // ends closed, on the wall
    expect(Math.abs(arc.points[0].y - 6.0)).toBeCloseTo(0.9)            // starts at the open leaf
  })

  it('two arcs of half the width from 1.2 m', () => {
    const arcs = doorSwingArcs(door(4.6, 1.5, 1.2, front), front, 1)
    expect(arcs).toHaveLength(2)
    for (const a of arcs) expect(Math.hypot(a.points[0].x - a.hinge.x, a.points[0].y - a.hinge.y)).toBeCloseTo(0.6)
  })
})
