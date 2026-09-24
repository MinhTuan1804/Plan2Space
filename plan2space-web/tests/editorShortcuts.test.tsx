import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useEditorStore } from '../src/stores/editorStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'

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
