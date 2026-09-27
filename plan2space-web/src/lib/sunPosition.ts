// Where the sun is, after NOAA's general solar position equations (fractional year γ), to well within 1°.
const rad = Math.PI / 180

export const CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'Hà Nội', lat: 21.028, lon: 105.854 }, { name: 'Hải Phòng', lat: 20.845, lon: 106.688 },
  { name: 'Đà Nẵng', lat: 16.054, lon: 108.202 }, { name: 'Huế', lat: 16.464, lon: 107.586 },
  { name: 'Nha Trang', lat: 12.238, lon: 109.197 }, { name: 'Đà Lạt', lat: 11.94, lon: 108.458 },
  { name: 'TP.HCM', lat: 10.776, lon: 106.7 }, { name: 'Cần Thơ', lat: 10.045, lon: 105.747 },
]

// A local date (YYYY-MM-DD) and hour in Vietnam (UTC+7) as an instant.
// ponytail: one time zone for every place; a custom location abroad keeps Vietnamese clock time.
export function sunTime(date: string, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + (hour - 7) * 3600e3)
}

// Altitude above the horizon and azimuth clockwise from true north, in degrees.
export function sunPosition(when: Date, lat: number, lon: number): { altitudeDeg: number; azimuthDeg: number } {
  const start = Date.UTC(when.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((when.getTime() - start) / 86400e3) + 1
  const hours = when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24)
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const trueSolarMinutes = hours * 60 + eqTime + 4 * lon
  const hourAngle = (trueSolarMinutes / 4 - 180) * rad
  const phi = lat * rad
  const sinAlt = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)))
  // Measured from south towards west, then turned to be from north clockwise; atan2 has no edge cases.
  const fromSouth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi))
  return { altitudeDeg: altitude / rad, azimuthDeg: ((fromSouth / rad + 180) % 360 + 360) % 360 }
}

// World-space unit vector towards the sun. North lies `northDeg` clockwise from the plan's +y; plan y is world -z.
export function sunDirection(altitudeDeg: number, azimuthDeg: number, northDeg: number): [number, number, number] {
  const alt = altitudeDeg * rad
  const onPlan = (azimuthDeg + northDeg) * rad
  return [Math.cos(alt) * Math.sin(onPlan), Math.sin(alt), -Math.cos(alt) * Math.cos(onPlan)]
}
