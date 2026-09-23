import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'

vi.mock('../src/services/geometryService')

describe('saveToServer conflict handling', () => {
  beforeEach(() => useGeometryStore.setState({ walls: [], rooms: [], openings: [], version: 1, saveConflict: false }))

  it('sets saveConflict true on a 409 response instead of throwing unhandled', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 409 } })

    await useGeometryStore.getState().saveToServer('proj-1')

    expect(useGeometryStore.getState().saveConflict).toBe(true)
  })

  it('clears saveConflict and bumps version on a successful save', async () => {
    useGeometryStore.setState({ saveConflict: true })
    vi.mocked(geometryService.saveGeometry).mockResolvedValue({ version: 2 })

    await useGeometryStore.getState().saveToServer('proj-1')

    expect(useGeometryStore.getState().saveConflict).toBe(false)
    expect(useGeometryStore.getState().version).toBe(2)
  })
})
