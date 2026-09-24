import { describe, it, expect } from 'vitest'
import { renderHook, act, render, fireEvent } from '@testing-library/react'
import React from 'react'
import { useMeasureTool } from '../src/components/studio/Canvas2D/useMeasureTool'
import { CalibrationDialog } from '../src/components/studio/Canvas2D/CalibrationDialog'
import { useEditorStore } from '../src/stores/editorStore'
import { useEditorShortcuts } from '../src/hooks/useEditorShortcuts'

describe('measure tool', () => {
  it('two clicks measure the line between them; a third starts over', () => {
    const { result } = renderHook(() => useMeasureTool())
    act(() => result.current.onPointerDown({ x: 0, y: 0 }))
    act(() => result.current.onPointerMove({ x: 3, y: 4 }))
    expect(result.current.preview).toEqual([{ x: 0, y: 0 }, { x: 3, y: 4 }])
    expect(result.current.measuredM).toBeNull()
    act(() => result.current.onPointerDown({ x: 3, y: 4 }))
    expect(result.current.measuredM).toBeCloseTo(5)
    act(() => result.current.onPointerDown({ x: 9, y: 9 }))
    expect(result.current.measuredM).toBeNull()
  })

  it('M chooses the measure tool', () => {
    function Harness() { useEditorShortcuts(); return null }
    useEditorStore.setState({ tool: 'select', selection: null })
    render(React.createElement(Harness))
    fireEvent.keyDown(window, { key: 'm' })
    expect(useEditorStore.getState().tool).toBe('measure')
  })
})

describe('calibration dialog', () => {
  it('passes a valid real length on', () => {
    let applied: number | null = null
    const { getByLabelText, getByText } = render(React.createElement(CalibrationDialog,
      { measuredM: 34, onApply: (m: number) => { applied = m }, onCancel: () => {} }))
    fireEvent.change(getByLabelText('Real length in metres'), { target: { value: '7' } })
    fireEvent.click(getByText('Apply'))
    expect(applied).toBe(7)
  })

  it('refuses zero, negative and non-numeric lengths with a message', () => {
    let applied = false
    const { getByLabelText, getByText, getByRole } = render(React.createElement(CalibrationDialog,
      { measuredM: 34, onApply: () => { applied = true }, onCancel: () => {} }))
    for (const value of ['0', '-3', 'abc']) {
      fireEvent.change(getByLabelText('Real length in metres'), { target: { value } })
      fireEvent.click(getByText('Apply'))
    }
    expect(applied).toBe(false)
    expect(getByRole('alert').textContent).toMatch(/positive/i)
  })

  it('refuses a line too short to calibrate from', () => {
    let applied = false
    const { getByLabelText, getByText, getByRole } = render(React.createElement(CalibrationDialog,
      { measuredM: 0.01, onApply: () => { applied = true }, onCancel: () => {} }))
    fireEvent.change(getByLabelText('Real length in metres'), { target: { value: '7' } })
    fireEvent.click(getByText('Apply'))
    expect(applied).toBe(false)
    expect(getByRole('alert').textContent).toMatch(/too short/i)
  })
})
