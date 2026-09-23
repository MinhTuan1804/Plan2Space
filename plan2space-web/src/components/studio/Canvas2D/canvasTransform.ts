import { Point } from '../../../services/geometryService'

export const PIXELS_PER_METER = 50

// Project space is y-up (metres); Konva screen space is y-down (pixels).
export function toScreen(p: Point): Point {
  return { x: p.x * PIXELS_PER_METER, y: -p.y * PIXELS_PER_METER }
}

export function screenDeltaToPlan(dx: number, dy: number): Point {
  return { x: dx / PIXELS_PER_METER, y: -dy / PIXELS_PER_METER }
}
