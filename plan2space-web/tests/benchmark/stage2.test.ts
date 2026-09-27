/// <reference types="vite/client" />
// Run by benchmark/run.py after stage 1: scores every two-storey case in benchmark/out and prints one
// "BENCH2 {case, stair, merge, floor}" line per case for the runner to read.
import { describe, it } from 'vitest'
import { Result, scoreMerge, scoreStair, scoreUpperFloor, toPlan, Truth } from './score'

const outputs = import.meta.glob<Result>('../../../benchmark/out/*.json', { eager: true, import: 'default' })
const truths = import.meta.glob<Truth>('../../../benchmark/{cases,private}/*/truth.json', { eager: true, import: 'default' })
const caseOf = (p: string) => p.split('/').slice(-1)[0].replace(/\.json$/, '')
const truthFor = (name: string) => Object.entries(truths).find(([p]) => p.split('/').slice(-2)[0] === name)?.[1]

describe('benchmark stage 2', () => {
  const entries = Object.entries(outputs)
  if (entries.length === 0) {
    it.skip('no stage 1 output in benchmark/out: run python benchmark/run.py', () => {})
    return
  }
  it('scores stairs, merge and upper floor', () => {
    for (const [p, result] of entries) {
      const name = caseOf(p)
      const truth = truthFor(name)
      if (!truth?.levels) continue
      const plan = toPlan(result)
      console.log('BENCH2 ' + JSON.stringify({
        case: name, stair: scoreStair(plan, truth), merge: scoreMerge(plan, truth), floor: scoreUpperFloor(plan, truth) }))
    }
  })
})
