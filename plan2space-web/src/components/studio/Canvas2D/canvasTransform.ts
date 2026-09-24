import { Point, Wall } from '../../../services/geometryService'

export const PIXELS_PER_METER = 50

// Project space is y-up (metres); Konva screen space is y-down (pixels).
export function toScreen(p: Point): Point {
  return { x: p.x * PIXELS_PER_METER, y: -p.y * PIXELS_PER_METER }
}

export function screenToPlan(p: Point): Point {
  return { x: p.x / PIXELS_PER_METER, y: -p.y / PIXELS_PER_METER }
}

export function screenDeltaToPlan(dx: number, dy: number): Point {
  return { x: dx / PIXELS_PER_METER, y: -dy / PIXELS_PER_METER }
}

export interface StageView {
  scale: number
  x: number
  y: number
}

const FIT_MARGIN = 0.1
const MIN_SCALE = 0.2
const MAX_SCALE = 5

// Stage scale/position that shows every wall centred in the viewport (plan origin bottom-left when empty).
export function fitView(walls: Wall[], viewport: { width: number; height: number }): StageView {
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return { scale: 1, x: 80, y: viewport.height - 80 }

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const widthPx = Math.max((maxX - minX) * PIXELS_PER_METER, 1)
  const heightPx = Math.max((maxY - minY) * PIXELS_PER_METER, 1)
  const usable = 1 - 2 * FIT_MARGIN
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
    Math.min((viewport.width * usable) / widthPx, (viewport.height * usable) / heightPx)))

  const centre = toScreen({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 })
  return { scale, x: viewport.width / 2 - centre.x * scale, y: viewport.height / 2 - centre.y * scale }
}
