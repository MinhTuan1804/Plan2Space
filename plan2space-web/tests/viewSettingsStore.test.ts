import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as service from '../src/services/viewSettingsService'
import { DEFAULT_VIEW_SETTINGS, ViewSettings } from '../src/services/viewSettingsService'
import { useViewSettingsStore } from '../src/stores/viewSettingsStore'

vi.mock('../src/services/viewSettingsService', async (orig) => ({
  ...(await orig<typeof import('../src/services/viewSettingsService')>()),
  fetchViewSettings: vi.fn(), saveViewSettings: vi.fn(),
}))

const danang: ViewSettings = { location: { lat: 16.054, lon: 108.202 }, northDeg: 30, views: [] }

describe('view settings store', () => {
  beforeEach(() => {
    vi.mocked(service.fetchViewSettings).mockReset()
    vi.mocked(service.saveViewSettings).mockReset()
    useViewSettingsStore.setState({ projectId: 'p', settings: DEFAULT_VIEW_SETTINGS, saveError: null })
  })

  it('loads the project settings, or keeps the defaults when that fails', async () => {
    vi.mocked(service.fetchViewSettings).mockResolvedValueOnce(danang)
    await useViewSettingsStore.getState().load('p')
    expect(useViewSettingsStore.getState().settings).toEqual(danang)
    vi.mocked(service.fetchViewSettings).mockRejectedValueOnce(new Error('down'))
    await useViewSettingsStore.getState().load('q')
    expect(useViewSettingsStore.getState().settings).toEqual(DEFAULT_VIEW_SETTINGS)
  })

  it('the latest change wins even when an earlier save finishes last', async () => {
    let finishFirst!: () => void
    vi.mocked(service.saveViewSettings)
      .mockImplementationOnce(() => new Promise<void>((r) => { finishFirst = r }))
      .mockResolvedValueOnce(undefined)
    const first = useViewSettingsStore.getState().update({ northDeg: 10 })
    const second = useViewSettingsStore.getState().update({ northDeg: 20 })
    await second
    finishFirst()
    await first
    expect(useViewSettingsStore.getState().settings.northDeg).toBe(20)
    expect(vi.mocked(service.saveViewSettings).mock.lastCall![1].northDeg).toBe(20)
    expect(useViewSettingsStore.getState().saveError).toBeNull()
  })

  it('a failed save says so and keeps the change on screen', async () => {
    vi.mocked(service.saveViewSettings).mockRejectedValueOnce(new Error('500'))
    await useViewSettingsStore.getState().update({ northDeg: 45 })
    expect(useViewSettingsStore.getState().settings.northDeg).toBe(45)
    expect(useViewSettingsStore.getState().saveError).toBe('Không lưu được cài đặt xem')
  })
})
