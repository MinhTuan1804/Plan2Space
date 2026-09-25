import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doorFit } from './door.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('a centimetre door becomes metres: frame centred on its footprint, base on the floor, hinge at the leaf edge', () => {
  const door = { min: [-48.5, 0, -9.0], max: [48.5, 206, 9.1] }
  const leaf = { min: [-42.5, 0, 6.6], max: [42.5, 200, 10.6] }
  const f = doorFit(door, leaf, 'min-x')
  near(f.scale, 0.01)
  near(f.widthM, 0.97); near(f.heightM, 2.06); near(f.depthM, 0.181)
  near(f.translation[0], 0); near(f.translation[1], 0); near(f.translation[2], -0.0005)
  near(f.leafWidthM, 0.85)
  near(f.hingeX, -0.425)                       // the leaf's hinge edge, in the frame's metres
  near(f.hingeZ, 0.086 - 0.0005)               // the leaf's mid-thickness
})
