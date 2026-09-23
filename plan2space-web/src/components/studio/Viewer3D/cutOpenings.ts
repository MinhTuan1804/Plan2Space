import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'
import { Wall, Opening } from '../../../services/geometryService'

const evaluator = new Evaluator()

function openingCutterGeometry(wall: Wall, opening: Opening): THREE.BufferGeometry {
  const [start, end] = wall.points
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const height = opening.type === 'Door' ? 2.1 : 1.2 // standard door/window heights, meters
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
    currentBrush = result
  }

  return currentBrush.geometry
}
