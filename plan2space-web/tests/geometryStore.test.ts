import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

describe('geometryStore', () => {
  beforeEach(() => useGeometryStore.setState({ walls: [], rooms: [], openings: [], version: 0 }))

  it('loadFromServer populates walls/rooms/openings and version', async () => {
    vi.mocked(geometryService.fetchGeometry).mockResolvedValue({
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: []
    })

    await useGeometryStore.getState().loadFromServer('proj-1')

    expect(useGeometryStore.getState().walls).toHaveLength(1)
    expect(useGeometryStore.getState().version).toBe(1)
  })

  it('updateWall mutates the matching wall points', () => {
    useGeometryStore.setState({
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: [], version: 1
    })
    useGeometryStore.getState().updateWall('w1', [{ x: 0, y: 0 }, { x: 6, y: 0 }])
    expect(useGeometryStore.getState().walls[0].points[1].x).toBe(6)
  })
})
