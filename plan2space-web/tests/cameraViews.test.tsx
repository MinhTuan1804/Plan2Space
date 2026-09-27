import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ease, roomView, toWorld } from '../src/lib/cameraViews'
import { ViewsPanel } from '../src/components/studio/Viewer3D/ViewsPanel'
import { useViewSettingsStore } from '../src/stores/viewSettingsStore'
import { useEditorStore } from '../src/stores/editorStore'
import { DEFAULT_VIEW_SETTINGS } from '../src/services/viewSettingsService'
import { Room } from '../src/services/geometryService'

const room: Room = { id: 'r', label: 'LIVING', version: 1, level: 1,
  points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }] }

describe('camera views', () => {
  it('looks at a room from its south-east, 45° up, 1.2 × its larger side away', () => {
    const { position: p, target: t } = roomView(room, 3.6)
    expect(t[2]).toBeCloseTo(4.8)
    expect(t[0]).toBeGreaterThan(0); expect(t[0]).toBeLessThan(4); expect(t[1]).toBeGreaterThan(0); expect(t[1]).toBeLessThan(3)
    const d = Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2])
    expect(d).toBeCloseTo(4.8)
    expect(p[0]).toBeGreaterThan(t[0]); expect(p[1]).toBeLessThan(t[1])
    expect(p[2] - t[2]).toBeCloseTo(Math.hypot(p[0] - t[0], p[1] - t[1]))
  })
  it('eases in and out, and maps plan to world', () => {
    expect([ease(0), ease(0.5), ease(1)]).toEqual([0, 0.5, 1])
    expect(ease(0.25)).toBeLessThan(0.25)
    expect(toWorld([1, 2, 3])).toEqual([1, 3, -2])
  })
})

describe('the saved views panel', () => {
  beforeEach(() => {
    cleanup()
    useViewSettingsStore.setState({ projectId: null, settings: DEFAULT_VIEW_SETTINGS, saveError: null })
    useEditorStore.setState({ flyTo: null, level: 0 })
  })
  const current = { x: 5, y: 6, headingDeg: 0, targetHeight: 1.2, camera: [9, 1, 7] as [number, number, number] }

  it('saves the current view by name, flies to it, and deletes it', async () => {
    render(<ViewsPanel current={current} />)
    fireEvent.click(screen.getByRole('button', { name: /Góc nhìn/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu góc nhìn' }))
    fireEvent.change(screen.getByLabelText('Tên góc nhìn'), { target: { value: 'Cửa chính' } })
    fireEvent.submit(screen.getByLabelText('Tên góc nhìn'))
    expect(useViewSettingsStore.getState().settings.views).toEqual(
      [{ name: 'Cửa chính', level: 0, position: [9, 1, 7], target: [5, 6, 1.2] }])
    fireEvent.click(screen.getByRole('button', { name: 'Cửa chính' }))
    expect(useEditorStore.getState().flyTo).toEqual({ position: [9, 1, 7], target: [5, 6, 1.2], level: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Xoá Cửa chính' }))
    expect(useViewSettingsStore.getState().settings.views).toEqual([])
  })
})
