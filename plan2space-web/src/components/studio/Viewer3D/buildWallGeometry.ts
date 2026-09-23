import * as THREE from 'three'
import { Wall } from '../../../services/geometryService'

export function buildWallGeometry(wall: Wall): THREE.BufferGeometry {
  const [start, end] = wall.points
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2

  const geometry = new THREE.BoxGeometry(length, wall.thicknessMeters, wall.heightMeters)
  geometry.rotateZ(angle)
  geometry.translate(midX, midY, wall.heightMeters / 2)
  return geometry
}
