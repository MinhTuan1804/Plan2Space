import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'

function Harness() {
  useEditorShortcuts()
  return <input aria-label="field" />
}

describe('furniture shortcuts', () => {
  beforeEach(() => {
    useGeometryStore.setState({ projectId: 'p', walls: [], openings: [], version: 1, dirty: false, wallsEdited: false,
      rooms: [{ id: 'r1', label: 'Room 1', version: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 0 }] }],
      furniture: [{ id: 'f1', catalogId: 'sofa_set', x: 1, y: 1, rotationDeg: 0 }] })
    useEditorStore.setState({ tool: 'select', selection: { kind: 'furniture', id: 'f1' }, walking: false })
  })

  it('F chooses the furniture tool', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'f' })
    expect(useEditorStore.getState().tool).toBe('furniture')
  })

  it('R turns the selected piece a quarter turn; Delete removes it', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'r' })
    expect(useGeometryStore.getState().furniture[0].rotationDeg).toBe(90)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useGeometryStore.getState().furniture).toHaveLength(0)
  })

  it('R typed into a field, or while walking, does nothing', () => {
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('field'), { key: 'r' })
    useEditorStore.setState({ walking: true })
    fireEvent.keyDown(window, { key: 'r' })
    expect(useGeometryStore.getState().furniture[0].rotationDeg).toBe(0)
  })

  it('Delete on a selected room removes nothing', () => {
    useEditorStore.setState({ selection: { kind: 'room', id: 'r1' } })
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useGeometryStore.getState().rooms).toHaveLength(1)
    expect(useGeometryStore.getState().furniture).toHaveLength(1)
  })
})
