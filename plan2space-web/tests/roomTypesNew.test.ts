import { describe, it, expect } from 'vitest'
import { roomTypeOf } from '../src/lib/roomTypes'
import { floorMaterialFor } from '../src/components/studio/Viewer3D/floorPlan'

// Names as two real plans write them (Vietnamese and English), with the floor each should get.
const cases: [string, string | null, 'wood' | 'tile'][] = [
  ['PHÒNG THỜ', 'altar', 'wood'], ['ALTAR ROOM', 'altar', 'wood'], ['ALTAR STORE', 'altar', 'wood'],
  ['GARA', 'garage', 'tile'], ['GARAGE', 'garage', 'tile'],
  ['SINH HOẠT CHUNG', 'living', 'wood'], ['FAMILY AREA', 'living', 'wood'],
  ['GIẾNG TRỜI 1', 'courtyard', 'tile'], ['LIGHT WELL 2', 'courtyard', 'tile'], ['PASSAGE / DRYING YARD', 'courtyard', 'tile'],
  ['BAN CÔNG SAU', 'balcony', 'tile'], ['REAR BALCONY', 'balcony', 'tile'],
  ['KHO + GIẶT', 'storage', 'tile'], ['PASSAGE / STORE + LAUNDRY', 'storage', 'tile'],
  ['KITCHEN + DINING / PANTRY', 'kitchen', 'tile'], ['BẾP + ĂN', 'kitchen', 'tile'],
  ['PN1', 'bedroom', 'wood'], ['MASTER BEDROOM', 'bedroom', 'wood'],
]

describe('room types from the names plans use', () => {
  it.each(cases)('%s → %s, %s floor', (name, type, floor) => {
    expect(roomTypeOf(name)).toBe(type)
    expect(floorMaterialFor(20, roomTypeOf(name))).toBe(floor)
  })
})
