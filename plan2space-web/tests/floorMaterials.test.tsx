import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { defaultFloorMaterial, floorMaterialOf, FLOOR_MATERIALS } from '../src/lib/floorMaterials'
import { useGeometryStore } from '../src/stores/geometryStore'
import { RoomPanel } from '../src/components/studio/Canvas2D/RoomPanel'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService', async (orig) => ({ ...(await orig<object>()), saveGeometry: vi.fn() }))

const room = (label: string, floorMaterial?: string | null) =>
  ({ id: 'r', label, version: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }], floorMaterial })

describe('floor materials', () => {
  it('follow the room type by default', () => {
    expect(defaultFloorMaterial('bathroom')).toBe('ceramic_tile')
    expect(defaultFloorMaterial('kitchen')).toBe('terrazzo')
    expect(defaultFloorMaterial('courtyard')).toBe('pebbles')
    expect(defaultFloorMaterial('garage')).toBe('concrete')
    expect(defaultFloorMaterial('balcony')).toBe('ceramic_tile')
    expect(defaultFloorMaterial('bedroom')).toBe('wood_oak')
    expect(defaultFloorMaterial(null)).toBe('wood_oak')
  })
  it('a chosen one wins; an unknown one falls back to the default', () => {
    expect(floorMaterialOf(room('WC 1', 'marble'))).toBe('marble')
    expect(floorMaterialOf(room('WC 1', 'gold'))).toBe('ceramic_tile')
    expect(floorMaterialOf(room('LIGHT WELL 1'))).toBe('pebbles')
    expect(FLOOR_MATERIALS.map((m) => m.id)).toEqual(['wood_oak', 'wood_walnut', 'wood_light', 'marble', 'ceramic_tile', 'terrazzo', 'pebbles', 'concrete'])
  })
})

describe('the room panel floor select', () => {
  beforeEach(() => {
    cleanup()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    useGeometryStore.setState({ projectId: 'p', version: 1, walls: [], openings: [], furniture: [], rooms: [room('LIVING ROOM')] })
  })
  it('sets the room floor, saves it, and "Tự động" clears it', async () => {
    render(<RoomPanel roomId="r" />)
    fireEvent.change(screen.getByLabelText('Sàn'), { target: { value: 'marble' } })
    expect(useGeometryStore.getState().rooms[0].floorMaterial).toBe('marble')
    await useGeometryStore.getState().saveToServer('p')
    expect(vi.mocked(geometryService.saveGeometry).mock.lastCall![2].rooms[0].floorMaterial).toBe('marble')
    fireEvent.change(screen.getByLabelText('Sàn'), { target: { value: '' } })
    expect(useGeometryStore.getState().rooms[0].floorMaterial ?? null).toBeNull()
  })
})
