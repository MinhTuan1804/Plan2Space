import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { planUVs, texturePaths } from '../src/components/studio/Viewer3D/pbr'

describe('pbr floors', () => {
  it('picks the texture size for the quality', () => {
    expect(texturePaths('marble', 'low')).toEqual({
      color: '/materials/marble/color_512.webp', normal: '/materials/marble/normal_512.webp', roughness: '/materials/marble/roughness_512.webp' })
    expect(texturePaths('marble', 'high').color).toBe('/materials/marble/color_1k.webp')
  })
  it('lays the texture by plan metres: one repeat per tileM', () => {
    const g = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2, 0), new THREE.Vector2(2, 1), new THREE.Vector2(0, 1)]))
    planUVs(g, 1)
    const uv = g.getAttribute('uv')
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i)), vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i))
    expect([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]).toEqual([0, 2, 0, 1])
    planUVs(g, 2)
    expect(Math.max(...Array.from({ length: uv.count }, (_, i) => g.getAttribute('uv').getX(i)))).toBe(1)
  })
})
