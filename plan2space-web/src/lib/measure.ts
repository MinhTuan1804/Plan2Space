import * as THREE from 'three'
import { Picked } from '../stores/editorStore'
import { Vec3 } from '../services/viewSettingsService'

// What a clicked mesh belongs to: the nearest ancestor tagged with userData.pick (a GLB's inner mesh included).
export function findPick(object: THREE.Object3D | null): NonNullable<Picked> | null {
  for (let o = object; o; o = o.parent) if (o.userData?.pick) return o.userData.pick
  return null
}

export const distance3 = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
export const formatMetres = (d: number) => `${d.toFixed(2)} m`
export const formatArea = (a: number) => `${a.toFixed(1)} m²`
