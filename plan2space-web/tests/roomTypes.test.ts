import { describe, it, expect } from 'vitest'
import { roomTypeOf, labelFor } from '../src/lib/roomTypes'

describe('room types', () => {
  it('reads the fixed labels and common spellings', () => {
    expect(roomTypeOf('Phòng ngủ')).toBe('bedroom')
    expect(roomTypeOf('phong khach')).toBe('living')
    expect(roomTypeOf('Phòng ăn')).toBe('dining')
    expect(roomTypeOf('Bếp')).toBe('kitchen')
    expect(roomTypeOf('WC')).toBe('bathroom')
    expect(roomTypeOf('Phòng tắm')).toBe('bathroom')
    expect(roomTypeOf('Room 3')).toBeNull()
  })
  it('labels round-trip', () => {
    expect(roomTypeOf(labelFor('kitchen'))).toBe('kitchen')
  })
})
