import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'
import { keysFromCodes } from '../src/components/studio/Walk/useMovementKeys'

function Harness() {
  useEditorShortcuts()
  return null
}

describe('while walking', () => {
  beforeEach(() => {
    useGeometryStore.setState({
      projectId: 'p', rooms: [], openings: [], version: 1, dirty: false, wallsEdited: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
    })
    useEditorStore.setState({ tool: 'select', selection: { kind: 'wall', id: 'w1' }, walking: true })
  })

  it('movement keys do not switch editor tools', () => {
    render(<Harness />)
    for (const key of ['w', 'a', 's', 'd', 'o', 'm', 'v']) fireEvent.keyDown(window, { key })
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('Delete and Backspace do not delete the selected wall behind the walk view', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Delete' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })
})

describe('movement keys', () => {
  it('WASD and the arrows move; Shift runs', () => {
    expect(keysFromCodes(new Set(['KeyW', 'ShiftLeft']))).toEqual({ forward: true, back: false, left: false, right: false, run: true })
    expect(keysFromCodes(new Set(['ArrowDown', 'ArrowLeft']))).toEqual({ forward: false, back: true, left: true, right: false, run: false })
  })
})
