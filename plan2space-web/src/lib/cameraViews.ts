import { Room } from '../services/geometryService'
import { Vec3 } from '../services/viewSettingsService'
import { interiorPoint } from './planGeometry'

const EYE_ABOVE_FLOOR_M = 1.2
const DISTANCE_PER_SIDE = 1.2
const UP = Math.PI / 4

// A view of a room from its south-east corner, 45° up: target in the room at eye height, plan [x, y, h].
export function roomView(room: Room, elevation: number): { position: Vec3; target: Vec3 } {
  const c = interiorPoint(room.points)
  const xs = room.points.map((p) => p.x), ys = room.points.map((p) => p.y)
  const d = DISTANCE_PER_SIDE * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const across = (d * Math.cos(UP)) / Math.SQRT2
  const target: Vec3 = [c.x, c.y, elevation + EYE_ABOVE_FLOOR_M]
  return { target, position: [c.x + across, c.y - across, target[2] + d * Math.sin(UP)] }
}

export const ease = (t: number) => t * t * (3 - 2 * t)
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
// Plan (x, y, h) is world (x, h, −y).
export const toWorld = ([x, y, h]: Vec3): Vec3 => [x, h, -y]
