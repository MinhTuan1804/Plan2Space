import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitTransform, applyTransform } from './fit.mjs'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`)

test('a centimetre model is scaled uniformly to fit, centred, standing on the floor', () => {
  const t = fitTransform({ min: [10, 5, 20], max: [210, 105, 70] }, { widthM: 2, depthM: 0.5, heightM: 1 })
  near(t.scale, 0.01)
  near(t.yawDeg, 0)
  const lo = applyTransform([10, 5, 20], t)
  const hi = applyTransform([210, 105, 70], t)
  near(lo[0], -1); near(hi[0], 1)        // width centred on x
  near(lo[1], 0); near(hi[1], 1)         // base on the floor
  near(lo[2], -0.25); near(hi[2], 0.25)  // depth centred on z
})

test('it turns when the long sides of the model and of the catalog entry disagree', () => {
  // A toilet: catalog depth (0.7) > width (0.4), model long along x.
  const t = fitTransform({ min: [0, 0, 0], max: [68, 78, 48] }, { widthM: 0.4, depthM: 0.7, heightM: 0.78 })
  near(t.yawDeg, 90)
  near(t.scale, Math.min(0.4 / 48, 0.7 / 68, 0.78 / 78))
})

test('proportions are never distorted: the tightest axis decides', () => {
  const t = fitTransform({ min: [0, 0, 0], max: [1, 4, 1] }, { widthM: 1, depthM: 1, heightM: 2 })
  near(t.scale, 0.5)
})

test('a quarter-turn yaw offset (a model whose front is its side) swaps the extents it is fitted by', () => {
  // Long along x (0.8) and the catalog is long along width too, but the offset turns the model 90°:
  // its 0.8 side now lies along depth (0.6), so it must shrink to 0.75.
  const t = fitTransform({ min: [0, 0, 0], max: [0.8, 1, 0.6] }, { widthM: 0.8, depthM: 0.6, heightM: 2 }, 90)
  near(t.yawDeg, 90)
  near(t.scale, 0.75)
})
