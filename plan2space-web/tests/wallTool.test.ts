import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWallTool } from '../src/components/studio/Canvas2D/useWallTool'
import { screenToPlan, toScreen } from '../src/components/studio/Canvas2D/canvasTransform'
import { wallFromDrag } from '../src/lib/planGeometry'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('wall tool', () => {
  beforeEach(() => useGeometryStore.setState({
    projectId: 'p', rooms: [], openings: [], version: 1, dirty: false, wallsEdited: false,
    walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
  }))

  it('screenToPlan undoes toScreen', () => {
    expect(screenToPlan(toScreen({ x: 1.5, y: -2 }))).toEqual({ x: 1.5, y: -2 })
  })

  it('a drag shorter than 10 cm is not a wall', () => {
    expect(wallFromDrag({ x: 0, y: 0 }, { x: 0.05, y: 0 })).toBeNull()
    expect(wallFromDrag({ x: 0, y: 0 }, { x: 2, y: 0 })).toEqual([{ x: 0, y: 0 }, { x: 2, y: 0 }])
  })

  it('a drag becomes a wall whose start snaps onto a nearby wall end', () => {
    // Snapping is what lets hand-drawn walls meet, so the rooms between them close.
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 4.1, y: 0.05 }))
    act(() => result.current.onPointerMove({ x: 4, y: 3 }))
    expect(result.current.preview).toEqual([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    act(() => result.current.onPointerUp({ x: 4, y: 3 }))

    const walls = useGeometryStore.getState().walls
    expect(walls).toHaveLength(2)
    expect(walls[1].points).toEqual([{ x: 4, y: 0 }, { x: 4, y: 3 }])
    expect(result.current.preview).toBeNull()
  })

  it('a partition drawn to the middle of a wall lands on that wall, so the rooms either side close', () => {
    // Review finding: only wall ends were snapped, so a partition stopping 5 cm short of a wall's body
    // left a gap the room finder cannot close, and the user had no way to see it.
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 2, y: 3 }))
    act(() => result.current.onPointerUp({ x: 2, y: 0.05 }))

    expect(useGeometryStore.getState().walls[1].points[1]).toEqual({ x: 2, y: 0 })
  })

  it('a click without a drag creates nothing', () => {
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 2, y: 2 }))
    act(() => result.current.onPointerUp({ x: 2, y: 2 }))
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })

  it('cancel drops the wall in progress', () => {
    const { result } = renderHook(() => useWallTool())
    act(() => result.current.onPointerDown({ x: 2, y: 2 }))
    act(() => result.current.cancel())
    act(() => result.current.onPointerUp({ x: 6, y: 2 }))
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })
})
