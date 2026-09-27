import { Room, Wall } from '../services/geometryService'
import { pointInPolygon } from './planGeometry'
import { isLightWellName, roomTypeOf } from './roomTypes'

export const PARAPET_HEIGHT_M = 1.1
const THIN_M = 0.12
const PROBE_M = 0.3

const openAir = (r: Room) => isLightWellName(r.label) || ['balcony', 'courtyard'].includes(roomTypeOf(r.label) ?? '')

// A thin wall on the outside of a balcony, drying yard or light well is a parapet, not a storey-high wall:
// drawn full height it stood as a thin slab stepping in from the thick facade. `rooms` are the wall's storey.
export function asParapet(wall: Wall, rooms: Room[]): Wall {
  if (wall.thicknessMeters > THIN_M || wall.points.length < 2) return wall
  const [a, b] = [wall.points[0], wall.points[wall.points.length - 1]]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len === 0) return wall
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
  const at = (s: number) => rooms.find((r) => pointInPolygon({ x: mid.x + s * n.x * PROBE_M, y: mid.y + s * n.y * PROBE_M }, r.points))
  const [left, right] = [at(1), at(-1)]
  const inside = left ?? right
  // Outside on one side, an open-air room on the other.
  return (!left !== !right) && inside && openAir(inside) ? { ...wall, heightMeters: Math.min(wall.heightMeters, PARAPET_HEIGHT_M) } : wall
}
