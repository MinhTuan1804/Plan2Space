import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useWallGeometry } from '../src/components/studio/Viewer3D/useWallGeometry'
import { Wall, Opening } from '../src/services/geometryService'

const wall: Wall = { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }
const door: Opening = { id: 'o1', wallId: 'w1', type: 'Door', position: { x: 2.5, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }
const otherWallWindow: Opening = { id: 'o2', wallId: 'w2', type: 'Window', position: { x: 9, y: 9 }, widthMeters: 1, sillHeightMeters: 0.9, version: 1 }

describe('useWallGeometry', () => {
  it('reuses the geometry when neither the wall nor its own openings changed', () => {
    const { result, rerender } = renderHook(({ w, o }) => useWallGeometry(w, o), { initialProps: { w: wall, o: [door] } })
    const first = result.current
    // A new openings array that only adds an opening on ANOTHER wall must not rebuild (no CSG rerun).
    rerender({ w: wall, o: [{ ...door }, otherWallWindow] })
    expect(result.current).toBe(first)
  })

  it('rebuilds when the wall moves and disposes the old GPU geometry', () => {
    const { result, rerender } = renderHook(({ w, o }) => useWallGeometry(w, o), { initialProps: { w: wall, o: [door] } })
    const first = result.current
    const dispose = vi.spyOn(first, 'dispose')
    rerender({ w: { ...wall, points: [{ x: 0, y: 1 }, { x: 5, y: 1 }] }, o: [door] })
    expect(result.current).not.toBe(first)
    expect(dispose).toHaveBeenCalled()
  })

  it('disposes the geometry on unmount', () => {
    const { result, unmount } = renderHook(() => useWallGeometry(wall, [door]))
    const dispose = vi.spyOn(result.current, 'dispose')
    unmount()
    expect(dispose).toHaveBeenCalled()
  })
})
