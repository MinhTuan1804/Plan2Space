import { Point, Room, Wall } from '../../../services/geometryService'
import { polygonArea } from '../../../lib/planGeometry'
import { RoomType, roomTypeOf } from '../../../lib/roomTypes'

// In these plans a room this small is almost always a WC; pipeline rooms carry no type, only "Room N".
export const TILE_ROOM_MAX_AREA_M2 = 6
export const DEFAULT_WALL_HEIGHT_M = 2.8

export type FloorKind = 'wood' | 'tile'

// A room the user has typed follows its type (kitchens and bathrooms are tiled); an untyped one, its size.
export function floorMaterialFor(areaM2: number, type: RoomType | null = null): FloorKind {
  if (type) return type === 'kitchen' || type === 'bathroom' ? 'tile' : 'wood'
  return areaM2 < TILE_ROOM_MAX_AREA_M2 ? 'tile' : 'wood'
}

export function floorPatches(rooms: Room[], walls: Wall[]): { points: Point[]; kind: FloorKind }[] {
  if (rooms.length > 0) {
    return rooms.map((r) => ({ points: r.points, kind: floorMaterialFor(polygonArea(r.points), roomTypeOf(r.label)) }))
  }
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return [{ kind: 'wood', points: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }] }]
}

export function wallHeight(walls: Wall[]): number {
  return walls.length === 0 ? DEFAULT_WALL_HEIGHT_M : Math.max(...walls.map((w) => w.heightMeters))
}

// Where the sun's shadow camera must look, in world coordinates (plan y becomes −z), and how far it must
// reach: three's default ±5 m box around the origin cuts shadows off on any real house.
const SHADOW_MARGIN_M = 1
export function shadowFrame(walls: Wall[]): { centre: [number, number, number]; halfSize: number } {
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return { centre: [0, 0, 0], halfSize: 5 }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { centre: [cx, 0, cy === 0 ? 0 : -cy], halfSize: Math.hypot(maxX - minX, maxY - minY) / 2 + SHADOW_MARGIN_M }
}
