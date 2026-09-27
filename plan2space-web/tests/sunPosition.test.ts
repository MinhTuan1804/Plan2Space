import { describe, it, expect } from 'vitest'
import { sunDirection, sunPosition, sunTime, CITIES } from '../src/lib/sunPosition'

// Expected values: NOAA's solar calculator (gml.noaa.gov/grad/solcalc, its own calcAzEl, UTC+7), 2026-09-27.
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)

describe('sun position', () => {
  it('Hà Nội, 21 June, 12:00: almost overhead', () => {
    near(sunPosition(sunTime('2026-06-21', 12), 21.028, 105.854).altitudeDeg, 87.56)
  })
  it('TP.HCM, 21 December, 08:00: low in the south-east', () => {
    const s = sunPosition(sunTime('2026-12-21', 8), 10.776, 106.7)
    near(s.altitudeDeg, 24.02); near(s.azimuthDeg, 121.85)
  })
  it('Đà Nẵng, 21 March, 06:00: rising in the east', () => {
    const s = sunPosition(sunTime('2026-03-21', 6), 16.054, 108.202)
    near(s.altitudeDeg, 1.69); near(s.azimuthDeg, 90.25)
  })
  it('stays finite at the polar circle in December', () => {
    const s = sunPosition(sunTime('2026-12-21', 12), 66, 106.7)
    expect(Number.isFinite(s.altitudeDeg) && Number.isFinite(s.azimuthDeg)).toBe(true)
    near(s.altitudeDeg, 0.96)
  })
  it('has the eight cities', () => {
    expect(CITIES.map((c) => c.name)).toEqual(['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'Huế', 'Nha Trang', 'Đà Lạt', 'TP.HCM', 'Cần Thơ'])
  })
})

describe('sun direction in the scene (plan y is world -z)', () => {
  const close = (v: number[], w: number[]) => v.forEach((x, i) => expect(x).toBeCloseTo(w[i], 6))
  it('overhead is straight up', () => close(sunDirection(90, 0, 0), [0, 1, 0]))
  it('on the horizon in the north, north up the plan: world -z', () => close(sunDirection(0, 0, 0), [0, 0, -1]))
  it('east, north up the plan: world +x', () => close(sunDirection(0, 90, 0), [1, 0, 0]))
  it('north turned 90° clockwise on the plan: a northern sun lies along plan +x', () => close(sunDirection(0, 0, 90), [1, 0, 0]))
})
