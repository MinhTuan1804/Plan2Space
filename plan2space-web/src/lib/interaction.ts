import { Room } from '../services/geometryService'
import { interiorPoint } from './planGeometry'

export const DOOR_SWING_S = 0.6
export const GARAGE_ROLL_S = 1.2
const LIGHT_BELOW_CEILING_M = 0.3
const LIGHT_REACH_PER_SIDE = 1.5

// How far open a door is, `elapsed` seconds into a swing of `duration`: eased in and out.
export function doorOpenFraction(elapsedS: number, durationS: number): number {
  const t = Math.min(1, Math.max(0, elapsedS / durationS))
  return t * t * (3 - 2 * t)
}

// A switched light stays as switched; one never touched is on at night.
export const lightOn = (roomId: string, overrides: Map<string, boolean>, night: boolean) => overrides.get(roomId) ?? night

// The ceiling light of a room: plan [x, y, z] within its level, and how far its light carries.
export function roomLight(room: Room, ceilingZ: number): { position: [number, number, number]; distance: number } {
  const c = interiorPoint(room.points)
  const xs = room.points.map((p) => p.x), ys = room.points.map((p) => p.y)
  const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  return { position: [c.x, c.y, ceilingZ - LIGHT_BELOW_CEILING_M], distance: LIGHT_REACH_PER_SIDE * side }
}
