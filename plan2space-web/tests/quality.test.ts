import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadQuality, saveQuality, shouldDowngrade } from '../src/lib/quality'
import { useEditorStore } from '../src/stores/editorStore'

describe('quality', () => {
  afterEach(() => vi.restoreAllMocks())
  it('downgrades only on a decline in the first 5 s, and only once', () => {
    expect(shouldDowngrade(3, false)).toBe(true)
    expect(shouldDowngrade(6, false)).toBe(false)
    expect(shouldDowngrade(3, true)).toBe(false)
  })
  it('defaults to high when storage throws, and persists a choice', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(loadQuality()).toBe('high')
    vi.restoreAllMocks()
    useEditorStore.getState().setQuality('low')
    expect(localStorage.getItem('p2s.quality')).toBe('low')
    expect(loadQuality()).toBe('low')
    saveQuality('high')
  })
})
