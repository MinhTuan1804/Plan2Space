import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { sectionPlanes, NO_CUT } from '../src/lib/sectionBox'
import { Wall } from '../src/services/geometryService'

const wall = (a: [number, number], b: [number, number], level = 0, h = 3.6): Wall =>
  ({ id: `${a}-${b}-${level}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: h, version: 1, level })
// A 10 x 13.6 m house of two 3.6 m storeys: 7.2 m tall.
const walls = [wall([0, 0], [10, 0]), wall([10, 0], [10, 13.6]), wall([0, 0], [10, 0], 1), wall([0, 13.6], [10, 13.6], 1)]
// World space: plan x → x, height → y, plan y → −z. A plane keeps the points where it is not negative.
const kept = (planes: THREE.Plane[], plan: { x: number; y: number }, h: number) =>
  planes.every((p) => p.distanceToPoint(new THREE.Vector3(plan.x, h, -plan.y)) >= 0)

describe('section box', () => {
  it('no cut, no planes', () => {
    expect(sectionPlanes(walls, NO_CUT)).toEqual([])
  })
  it('cutting at half height takes the upper storey off', () => {
    const planes = sectionPlanes(walls, { ...NO_CUT, z: 0.5 })
    expect(kept(planes, { x: 5, y: 5 }, 3.0)).toBe(true)
    expect(kept(planes, { x: 5, y: 5 }, 4.0)).toBe(false)
  })
  it('the x and y sliders cut from the far sides of the plan', () => {
    const planes = sectionPlanes(walls, { x: 0.5, y: 0.25, z: 1 })
    expect(kept(planes, { x: 4, y: 3 }, 1)).toBe(true)
    expect(kept(planes, { x: 6, y: 3 }, 1)).toBe(false)     // past 5 m in x
    expect(kept(planes, { x: 4, y: 4 }, 1)).toBe(false)     // past 3.4 m in y
  })
})
