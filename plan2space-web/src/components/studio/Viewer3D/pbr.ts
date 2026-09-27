import * as THREE from 'three'
import { Quality } from '../../../lib/quality'

export const texturePaths = (id: string, quality: Quality) => {
  const size = quality === 'high' ? '1k' : '512'
  const at = (map: string) => `/materials/${id}/${map}_${size}.webp`
  return { color: at('color'), normal: at('normal'), roughness: at('roughness') }
}

// UVs from plan metres (the position's x/y), one texture repeat per tileM: a 1 m tile is 1 m in any room.
export function planUVs(geometry: THREE.BufferGeometry, tileM: number): void {
  const pos = geometry.getAttribute('position')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uv[2 * i] = pos.getX(i) / tileM
    uv[2 * i + 1] = pos.getY(i) / tileM
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
