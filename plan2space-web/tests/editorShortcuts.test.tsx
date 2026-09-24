import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'
import { useGeometryStore } from '../src/stores/geometryStore'

function Harness() {
  useEditorShortcuts()
  return <textarea aria-label="chat" />
}

describe('editor shortcuts', () => {
  beforeEach(() => useEditorStore.setState({ tool: 'select', selection: null }))

  it('W, O and V choose the tool; Escape returns to select', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'w' })
    expect(useEditorStore.getState().tool).toBe('wall')
    fireEvent.keyDown(window, { key: 'o' })
    expect(useEditorStore.getState().tool).toBe('opening')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('typing in a text field does not switch tools', () => {
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('chat'), { key: 'w' })
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('choosing a tool clears the selection', () => {
    useEditorStore.setState({ selection: { kind: 'wall', id: 'w1' } })
    useEditorStore.getState().setTool('wall')
    expect(useEditorStore.getState().selection).toBeNull()
  })

  it('keeps the opening width within real door sizes', () => {
    useEditorStore.getState().setOpeningWidth(10)
    expect(useEditorStore.getState().openingWidthM).toBe(3)
    useEditorStore.getState().setOpeningWidth(0)
    expect(useEditorStore.getState().openingWidthM).toBe(0.4)
  })
})

describe('deleting the selection', () => {
  beforeEach(() => {
    useGeometryStore.setState({
      projectId: 'p', rooms: [], version: 1, dirty: false, wallsEdited: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      openings: [{ id: 'd1', wallId: 'w1', type: 'Door', position: { x: 1, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }],
    })
    useEditorStore.setState({ tool: 'select', selection: { kind: 'wall', id: 'w1' } })
  })

  it('Delete removes the selected wall and its door, then clears the selection', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useGeometryStore.getState().walls).toHaveLength(0)
    expect(useGeometryStore.getState().openings).toHaveLength(0)
    expect(useEditorStore.getState().selection).toBeNull()
  })

  it('Backspace removes a selected opening only', () => {
    useEditorStore.setState({ selection: { kind: 'opening', id: 'd1' } })
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(useGeometryStore.getState().openings).toHaveLength(0)
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })

  it('Backspace while typing in the chat deletes nothing', () => {
    const { getByLabelText } = render(<Harness />)
    fireEvent.keyDown(getByLabelText('chat'), { key: 'Backspace' })
    expect(useGeometryStore.getState().walls).toHaveLength(1)
  })
})
