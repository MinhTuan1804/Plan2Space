import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

describe('flipping a door', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false,
      rooms: [], furniture: [],
      walls: [{ id: 'w', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 3, version: 1 }],
      openings: [{ id: 'd', wallId: 'w', type: 'Door', position: { x: 2, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }] })
  })

  it('toggles the swing, marks the plan unsaved without touching the walls, and saves the choice', async () => {
    useGeometryStore.getState().flipDoorSwing('d')
    expect(useGeometryStore.getState().openings[0].swingFlipped).toBe(true)
    expect(useGeometryStore.getState().dirty).toBe(true)
    expect(useGeometryStore.getState().wallsEdited).toBe(false)
    await useGeometryStore.getState().saveToServer('p')
    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].openings[0].swingFlipped).toBe(true)
    useGeometryStore.getState().flipDoorSwing('d')
    expect(useGeometryStore.getState().openings[0].swingFlipped).toBe(false)
  })
})

describe('the door panel', () => {
  it('its button flips the selected door', async () => {
    const { render, screen, fireEvent } = await import('@testing-library/react')
    const { DoorPanel } = await import('../src/components/studio/Canvas2D/DoorPanel')
    useGeometryStore.setState({ openings: [{ id: 'd', wallId: 'w', type: 'Door', position: { x: 2, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }] })
    render(<DoorPanel openingId="d" />)
    fireEvent.click(screen.getByRole('button', { name: 'Đảo chiều mở cửa' }))
    expect(useGeometryStore.getState().openings[0].swingFlipped).toBe(true)
  })
})
