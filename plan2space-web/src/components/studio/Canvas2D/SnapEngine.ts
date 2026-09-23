import { Point, Wall } from '../../../services/geometryService'

export interface SnapOptions {
  endpointToleranceM?: number
  gridSizeM?: number
}

export function snapPoint(point: Point, _walls: Wall[], _excludeWallId: string, _options?: SnapOptions): Point {
  return point
}
