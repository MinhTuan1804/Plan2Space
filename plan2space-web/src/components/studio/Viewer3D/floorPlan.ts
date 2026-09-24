import { Point, Room, Wall } from '../../../services/geometryService'
import { polygonArea } from '../../../lib/planGeometry'

// In these plans a room this small is almost always a WC; pipeline rooms carry no type, only "Room N".
export const TILE_ROOM_MAX_AREA_M2 = 6
export const DEFAULT_WALL_HEIGHT_M = 2.8

export type FloorKind = 'wood' | 'tile'

export function floorMaterialFor(areaM2: number): FloorKind {
  return areaM2 < TILE_ROOM_MAX_AREA_M2 ? 'tile' : 'wood'
}

export function floorPatches(rooms: Room[], walls: Wall[]): { points: Point[]; kind: FloorKind }[] {
  if (rooms.length > 0) return rooms.map((r) => ({ points: r.points, kind: floorMaterialFor(polygonArea(r.points)) }))
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
