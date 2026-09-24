import { describe, it, expect } from 'vitest'
import { moveVector, spawnPoint, stepPlayer, wallBlockers, PLAYER_RADIUS_M, MAX_STEP_S } from '../src/lib/walkPhysics'
import { Opening, Room, Wall } from '../src/services/geometryService'

const still = { forward: false, back: false, left: false, right: false, run: false }
const wall = (id: string, a: [number, number], b: [number, number]): Wall =>
  ({ id, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 })
const opening = (type: 'Door' | 'Window', x: number): Opening =>
  ({ id: type, wallId: 'w', type, position: { x, y: 0 }, widthMeters: 0.9, sillHeightMeters: type === 'Door' ? 0 : 0.9, version: 1 })

/** Walk from `from` along `step` for `n` frames against `blockers`. */
function walk(from: { x: number; y: number }, step: { x: number; y: number }, n: number, blockers: ReturnType<typeof wallBlockers>) {
  let p = from
  for (let i = 0; i < n; i++) p = stepPlayer(p, step, blockers)
  return p
}

describe('moving', () => {
  it('walks 1.4 m/s, runs 3 m/s, and a diagonal is no faster', () => {
    expect(moveVector({ ...still, forward: true }, { x: 0, y: 1 }, 1)).toEqual({ x: 0, y: 1.4 })
    expect(moveVector({ ...still, forward: true, run: true }, { x: 0, y: 1 }, 1).y).toBeCloseTo(3)
    const d = moveVector({ ...still, forward: true, right: true }, { x: 0, y: 1 }, 1)
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1.4)
    expect(d.x).toBeGreaterThan(0)                          // facing north, right is east
    expect(moveVector(still, { x: 0, y: 1 }, 1)).toEqual({ x: 0, y: 0 })
  })

  it('ignores the vertical part of the view direction', () => {
    expect(moveVector({ ...still, forward: true }, { x: 0, y: 0.1 }, 1)).toEqual({ x: 0, y: 1.4 })
  })
})

describe('walls', () => {
  const plain = wallBlockers([wall('w', [-5, 0], [5, 0])], [])

  it("a wall stops the player at arm's length", () => {
    const p = walk({ x: 0, y: 2 }, { x: 0, y: -0.07 }, 60, plain)
    expect(p.y).toBeGreaterThanOrEqual(0.1 + PLAYER_RADIUS_M - 1e-6)
  })

  it('walking into a wall at an angle slides along it', () => {
    const p = walk({ x: 0, y: 1 }, { x: 0.05, y: -0.05 }, 60, plain)
    expect(p.x).toBeGreaterThan(2)
    expect(p.y).toBeGreaterThan(0.3)
  })

  it('a door opening can be walked through; a window cannot', () => {
    const door = wallBlockers([wall('w', [-5, 0], [5, 0])], [opening('Door', 0)])
    expect(walk({ x: 0, y: 2 }, { x: 0, y: -0.07 }, 60, door).y).toBeLessThan(-1)
    const window = wallBlockers([wall('w', [-5, 0], [5, 0])], [opening('Window', 0)])
    expect(walk({ x: 0, y: 2 }, { x: 0, y: -0.07 }, 60, window).y).toBeGreaterThan(0.3)
  })

  it('a corner walked into diagonally holds, even on a long frame', () => {
    const corner = wallBlockers([wall('a', [0, 0], [5, 0]), wall('b', [0, 0], [0, 5])], [])
    const p = walk({ x: 2, y: 2 }, { x: -3 * MAX_STEP_S, y: -3 * MAX_STEP_S }, 200, corner)
    expect(p.x).toBeGreaterThan(0.3)
    expect(p.y).toBeGreaterThan(0.3)
  })
})

describe('spawn', () => {
  const square = (x: number, y: number, s: number): Room =>
    ({ id: `${x}`, label: 'r', version: 1, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }, { x, y }] })

  it('starts in the middle of the largest room', () => {
    expect(spawnPoint([square(0, 0, 2), square(10, 0, 6)], [])).toEqual({ x: 13, y: 3 })
  })

  it('without rooms starts in the middle of the walls, and at the origin with nothing at all', () => {
    expect(spawnPoint([], [wall('a', [0, 0], [8, 0]), wall('b', [8, 0], [8, 4])])).toEqual({ x: 4, y: 2 })
    expect(spawnPoint([], [])).toEqual({ x: 0, y: 0 })
  })
})
