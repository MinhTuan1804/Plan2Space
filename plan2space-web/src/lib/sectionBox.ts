import * as THREE from 'three'
import { Wall } from '../services/geometryService'
import { levelElevation, levelsIn, storeyHeight } from './levels'

// How much of the house stays, per axis, as a fraction of its extent: 1 keeps it all.
// x and y cut the plan back from its far (max) sides, z cuts the house down from the top.
export interface SectionBox { x: number; y: number; z: number }
export const NO_CUT: SectionBox = { x: 1, y: 1, z: 1 }

// Clipping planes in world space (plan x → x, height → y, plan y → −z) for the renderer.
export function sectionPlanes(walls: Wall[], box: SectionBox): THREE.Plane[] {
  const points = walls.flatMap((w) => w.points)
  if (points.length === 0) return []
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const top = Math.max(...levelsIn(walls))
  const height = levelElevation(walls, top) + storeyHeight(walls, top)
  const planes: THREE.Plane[] = []
  if (box.x < 1) planes.push(new THREE.Plane(new THREE.Vector3(-1, 0, 0), minX + box.x * (maxX - minX)))
  if (box.y < 1) planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), minY + box.y * (maxY - minY)))
  if (box.z < 1) planes.push(new THREE.Plane(new THREE.Vector3(0, -1, 0), box.z * height))
  return planes
}
