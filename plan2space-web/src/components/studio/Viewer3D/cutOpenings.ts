import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { Wall, Opening, Point } from '../../../services/geometryService'

const evaluator = new Evaluator()

// Standard opening heights, metres: the cut, the door model and the window frame all use them.
export const DOOR_HEIGHT_M = 2.1
export const WINDOW_HEIGHT_M = 1.2

// Direction of the wall segment closest to the opening (a polyline wall has several).
export function segmentAngleAt(wall: Wall, p: Point): number {
  let best = { distance: Infinity, angle: 0 }
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i]
    const b = wall.points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (distance < best.distance) best = { distance, angle: Math.atan2(dy, dx) }
  }
  return best.angle
}

export function openingCutterGeometry(wall: Wall, opening: Opening): THREE.BufferGeometry {
  const angle = segmentAngleAt(wall, opening.position)
  const height = opening.type === 'Door' ? DOOR_HEIGHT_M : WINDOW_HEIGHT_M
  const geometry = new THREE.BoxGeometry(opening.widthMeters, wall.thicknessMeters * 2, height)
  geometry.rotateZ(angle)
  geometry.translate(opening.position.x, opening.position.y, opening.sillHeightMeters + height / 2)
  return geometry
}

export function cutOpeningsIntoWall(wallGeometry: THREE.BufferGeometry, wall: Wall, openings: Opening[]): THREE.BufferGeometry {
  const relevant = openings.filter((o) => o.wallId === wall.id)
  if (relevant.length === 0) return wallGeometry

  let currentBrush = new Brush(wallGeometry)
  currentBrush.updateMatrixWorld()

  for (const opening of relevant) {
    const cutterBrush = new Brush(openingCutterGeometry(wall, opening))
    cutterBrush.updateMatrixWorld()
    const result = evaluator.evaluate(currentBrush, cutterBrush, SUBTRACTION)
    cutterBrush.geometry.dispose()
    if (currentBrush.geometry !== wallGeometry) currentBrush.geometry.dispose()
    currentBrush = result
  }

  return currentBrush.geometry
}
