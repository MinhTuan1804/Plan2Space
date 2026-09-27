import { describe, it, expect } from 'vitest'
import { asParapet, PARAPET_HEIGHT_M } from '../src/lib/parapets'
import { Room, Wall } from '../src/services/geometryService'

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
const room = (id: string, label: string, pts: Room['points']): Room => ({ id, label, version: 1, points: pts })
const wall = (a: [number, number], b: [number, number], t: number): Wall =>
  ({ id: `${a}-${b}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: t, heightMeters: 3.6, version: 1 })

// Upstairs of the real house: a drying yard and a rear balcony at the back (y = 13.6), a bedroom between them.
const rooms = [room('d', 'PASSAGE / DRYING YARD', box(0, 9.6, 2.8, 13.6)), room('b', 'BEDROOM 4', box(2.8, 9.6, 6.8, 13.6)),
  room('f', 'FAMILY AREA / REAR BALCONY', box(6.8, 9.6, 10, 13.6))]

describe('parapets', () => {
  it('a thin outside wall of an open-air room is a 1.1 m parapet', () => {
    expect(asParapet(wall([0, 13.6], [2.8, 13.6], 0.11), rooms).heightMeters).toBe(PARAPET_HEIGHT_M)
    expect(asParapet(wall([6.8, 13.6], [10, 13.6], 0.11), rooms).heightMeters).toBe(PARAPET_HEIGHT_M)
    expect(PARAPET_HEIGHT_M).toBe(1.1)
  })
  it('a full outside wall, a thin wall of an indoor room, and a thin wall between two rooms stay full height', () => {
    expect(asParapet(wall([2.8, 13.6], [6.8, 13.6], 0.22), rooms).heightMeters).toBe(3.6)
    expect(asParapet(wall([2.8, 13.6], [6.8, 13.6], 0.11), rooms).heightMeters).toBe(3.6)   // the bedroom's
    expect(asParapet(wall([2.8, 9.6], [2.8, 13.6], 0.11), rooms).heightMeters).toBe(3.6)    // yard | bedroom
  })
})
