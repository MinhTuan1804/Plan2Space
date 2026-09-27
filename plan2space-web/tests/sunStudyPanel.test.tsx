import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SunStudyPanel } from '../src/components/studio/Viewer3D/SunStudyPanel'
import { useViewSettingsStore } from '../src/stores/viewSettingsStore'
import { useEditorStore } from '../src/stores/editorStore'
import { DEFAULT_VIEW_SETTINGS } from '../src/services/viewSettingsService'

describe('the sun study panel', () => {
  beforeEach(() => {
    cleanup()
    useViewSettingsStore.setState({ projectId: null, settings: DEFAULT_VIEW_SETTINGS, saveError: null })
    useEditorStore.setState({ sunDate: '2026-06-21', sunHour: 14 })
  })

  it('a city sets the location, the slider sets the hour, north is saved', () => {
    const update = vi.spyOn(useViewSettingsStore.getState(), 'update')
    render(<SunStudyPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Nắng/ }))
    fireEvent.change(screen.getByLabelText('Vị trí'), { target: { value: 'Đà Nẵng' } })
    expect(update).toHaveBeenCalledWith({ location: { lat: 16.054, lon: 108.202 } })
    fireEvent.change(screen.getByLabelText('Giờ'), { target: { value: '8.25' } })
    expect(useEditorStore.getState().sunHour).toBe(8.25)
    fireEvent.change(screen.getByLabelText('Hướng Bắc'), { target: { value: '45' } })
    expect(update).toHaveBeenCalledWith({ northDeg: 45 })
  })

  it('shows the save error', () => {
    useViewSettingsStore.setState({ saveError: 'Không lưu được cài đặt xem' })
    render(<SunStudyPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Nắng/ }))
    expect(screen.getByText('Không lưu được cài đặt xem')).toBeTruthy()
  })
})
