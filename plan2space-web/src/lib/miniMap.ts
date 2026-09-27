import { Point } from '../services/geometryService'

const MARGIN_SHARE = 0.05

// Plan <-> minimap pixels: the plan's longer side fills the map less a 5 % margin, the shorter is centred,
// and plan y points up the map.
export function mapTransform(b: { minX: number; minY: number; maxX: number; maxY: number }, size: number) {
  const margin = size * MARGIN_SHARE
  const w = Math.max(b.maxX - b.minX, 1e-6), h = Math.max(b.maxY - b.minY, 1e-6)
  const scale = (size - 2 * margin) / Math.max(w, h)
  const ox = (size - w * scale) / 2, oy = (size - h * scale) / 2
  return {
    toMap: (p: Point): Point => ({ x: ox + (p.x - b.minX) * scale, y: oy + (b.maxY - p.y) * scale }),
    toPlan: (q: Point): Point => ({ x: b.minX + (q.x - ox) / scale, y: b.maxY - (q.y - oy) / scale }),
  }
}
