import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { placeOpening } from '../src/lib/planGeometry'
import { useOpeningTool } from '../src/components/studio/Canvas2D/useOpeningTool'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorStore } from '../src/stores/editorStore'
import { Wall } from '../src/services/geometryService'

const walls: Wall[] = [
  { id: 'long', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
  { id: 'stub', points: [{ x: 0, y: 5 }, { x: 0.5, y: 5 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
]

describe('opening placement', () => {
  it('lands on the wall under the click', () => {
    expect(placeOpening({ x: 2, y: 0.2 }, walls, 0.9)).toEqual({ wallId: 'long', position: { x: 2, y: 0 } })
  })

  it('a click far from every wall places nothing', () => {
    expect(placeOpening({ x: 2, y: 2 }, walls, 0.9)).toBeNull()
  })

  it('near a wall end the opening is pulled inward so it fits', () => {
    const placed = placeOpening({ x: 0.1, y: 0 }, walls, 0.9)!
    expect(placed.position.x).toBeCloseTo(0.45)
    expect(placed.position.y).toBe(0)
  })

  it('a wall shorter than the opening gets nothing', () => {
    expect(placeOpening({ x: 0.25, y: 5 }, walls, 0.9)).toBeNull()
  })
})

describe('opening tool', () => {
  beforeEach(() => {
    useGeometryStore.setState({ projectId: 'p', walls, rooms: [], openings: [], version: 1, dirty: false, wallsEdited: false })
    useEditorStore.setState({ openingType: 'Door', openingWidthM: 0.9 })
  })

  it('places a door at floor level', () => {
    const { result } = renderHook(() => useOpeningTool())
    act(() => result.current.onPointerDown({ x: 2, y: 0.1 }))
    const [door] = useGeometryStore.getState().openings
    expect(door).toMatchObject({ wallId: 'long', type: 'Door', widthMeters: 0.9, sillHeightMeters: 0 })
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
  })

  it('places a window on a 0.9 m sill', () => {
    useEditorStore.setState({ openingType: 'Window', openingWidthM: 1.2 })
    const { result } = renderHook(() => useOpeningTool())
    act(() => result.current.onPointerDown({ x: 2, y: 0.1 }))
    expect(useGeometryStore.getState().openings[0]).toMatchObject({ type: 'Window', widthMeters: 1.2, sillHeightMeters: 0.9 })
  })
})
