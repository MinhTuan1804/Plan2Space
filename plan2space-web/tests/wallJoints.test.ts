import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildWallGeometry } from '../src/components/studio/Viewer3D/buildWallGeometry'
import { wallEndExtensions } from '../src/components/studio/Viewer3D/wallJoints'
import { Wall } from '../src/services/geometryService'

const wall = (id: string, a: [number, number], b: [number, number], t = 0.2): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: t, heightMeters: 3, version: 1 })

describe('wall joints', () => {
  it('an L corner: each wall reaches past the corner by the other wall\'s half thickness', () => {
    const a = wall('a', [0, 0], [4, 0])
    const b = wall('b', [4, 0], [4, 3], 0.3)
    const walls = [a, b]
    expect(wallEndExtensions(a, walls)).toEqual([0, 0.15])
    expect(wallEndExtensions(b, walls)).toEqual([0.1, 0])
  })

  it("a wall stopping at another wall's face reaches through to its far face", () => {
    const thin = wall('thin', [2, -2], [2, 2], 0.11)
    const butt = wall('butt', [0, 0], [1.945, 0])          // stops 0.055 short: at the thin wall's face
    const [, end] = wallEndExtensions(butt, [thin, butt])
    expect(end).toBeCloseTo(0.11, 6)
  })

  it('collinear neighbours (either side of a doorway) and free ends are not extended', () => {
    const left = wall('l', [0, 0], [2, 0])
    const bridge = wall('g', [2, 0], [3, 0])
    expect(wallEndExtensions(left, [left, bridge])).toEqual([0, 0])
  })

  it('the box grows by the extensions', () => {
    const g = buildWallGeometry(wall('a', [0, 0], [4, 0]), [0.1, 0.15])
    g.computeBoundingBox()
    expect(g.boundingBox!.min.x).toBeCloseTo(-0.1, 6)
    expect(g.boundingBox!.max.x).toBeCloseTo(4.15, 6)
  })
})
