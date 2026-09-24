import { Point, Wall } from '../../../services/geometryService'

export interface SnapOptions {
  endpointToleranceM?: number
  gridSizeM?: number
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function snapPoint(point: Point, walls: Wall[], excludeWallId: string, options: SnapOptions = {}): Point {
  const endpointTolerance = options.endpointToleranceM ?? 0.05
  const gridSize = options.gridSizeM ?? 0

  for (const wall of walls) {
    if (wall.id === excludeWallId) continue
    for (const candidate of wall.points) {
      if (distance(point, candidate) <= endpointTolerance) {
        return { x: candidate.x, y: candidate.y }
      }
    }
  }

  if (gridSize > 0) {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    }
  }

  return point
}
