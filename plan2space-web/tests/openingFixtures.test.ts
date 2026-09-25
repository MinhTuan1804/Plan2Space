import { describe, it, expect } from 'vitest'
import { doorLayout, windowParts, DOUBLE_DOOR_MIN_WIDTH_M } from '../src/components/studio/Viewer3D/openingFixtures'
import { DOOR_HEIGHT_M } from '../src/components/studio/Viewer3D/cutOpenings'

// The catalog's door: frame 0.97 × 2.06 × 0.18, leaf 0.85 wide hinged at x = -0.425.
const door = { widthM: 0.97, heightM: 2.06, depthM: 0.18, leafWidthM: 0.85, hingeX: -0.425, hingeZ: 0.08 }

describe('door layout', () => {
  it('a narrow doorway: the whole door stretched to the opening, one leaf swung open 90°', () => {
    const d = doorLayout(0.9, 0.2, door)
    expect(d.frameScale[0]).toBeCloseTo(0.9 / 0.97)
    expect(d.frameScale[1]).toBeCloseTo(DOOR_HEIGHT_M / 2.06)
    expect(d.frameScale[2]).toBeCloseTo(0.2 / 0.18)
    expect(d.leaves).toHaveLength(1)
    const [leaf] = d.leaves
    expect(leaf.position[0]).toBeCloseTo(-0.425 * (0.9 / 0.97))     // on its hinge
    expect(Math.abs(leaf.rotationY)).toBeCloseTo(Math.PI / 2)
    expect(leaf.offset).toEqual([0.425, 0, -0.08])
  })

  it(`from ${DOUBLE_DOOR_MIN_WIDTH_M} m: two mirrored leaves hinged on either jamb, meeting in the middle when closed`, () => {
    const w = 1.45
    const d = doorLayout(w, 0.22, door)
    expect(d.leaves).toHaveLength(2)
    const [left, right] = d.leaves
    expect(left.position[0]).toBeCloseTo(-right.position[0])
    expect(right.scale[0]).toBeCloseTo(-left.scale[0])                 // mirrored
    expect(left.rotationY).toBeCloseTo(-right.rotationY)                // both swing to the same side
    expect(left.position[0] + left.scale[0] * door.leafWidthM).toBeCloseTo(0)
  })
})

describe('window parts', () => {
  it('a frame, mullions about every 0.6 m and one pane of glass, all inside the opening', () => {
    const parts = windowParts(1.7, 1.2, 0.22)
    expect(parts.filter((p) => p.kind === 'glass')).toHaveLength(1)
    expect(parts.filter((p) => p.kind === 'frame')).toHaveLength(4 + 2)   // 3 panes → 2 mullions
    for (const p of parts) {
      expect(Math.abs(p.center[0]) + p.size[0] / 2).toBeLessThanOrEqual(1.7 / 2 + 1e-9)
      expect(p.center[2] - p.size[2] / 2).toBeGreaterThanOrEqual(-1e-9)
      expect(p.center[2] + p.size[2] / 2).toBeLessThanOrEqual(1.2 + 1e-9)
      expect(p.size[1]).toBeLessThanOrEqual(0.22)
    }
  })
})
