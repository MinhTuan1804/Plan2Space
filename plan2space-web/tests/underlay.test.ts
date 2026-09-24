import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { underlayRect } from '../src/components/studio/Canvas2D/canvasTransform'
import { useUnderlay } from '../src/components/studio/Canvas2D/useUnderlay'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as underlayService from '../src/services/underlayService'

vi.mock('../src/services/underlayService')

describe('underlay placement', () => {
  it('puts image pixel (0,0) at plan (0, H·mpp) and spans W·mpp by H·mpp metres', () => {
    // The worker mapped pixel (px, py) to metres (px·mpp, (H − py)·mpp); 1 m = 50 stage px.
    const rect = underlayRect({ fileId: 'f', metresPerPixel: 0.02, widthPx: 300, heightPx: 200 })
    expect(rect.x).toBeCloseTo(0)
    expect(rect.y).toBeCloseTo(-200)
    expect(rect.width).toBeCloseTo(300)
    expect(rect.height).toBeCloseTo(200)
  })
})

describe('useUnderlay', () => {
  beforeEach(() => {
    // jsdom has no object URLs; the hook revokes the one it made when it unmounts.
    URL.revokeObjectURL = vi.fn()
    vi.mocked(underlayService.fetchUnderlay).mockReset()
    vi.mocked(underlayService.fetchFileObjectUrl).mockReset().mockResolvedValue('blob:x')
    useGeometryStore.setState({ projectId: 'p', version: 1 })
  })

  it('a project without an underlay downloads no image', async () => {
    vi.mocked(underlayService.fetchUnderlay).mockResolvedValue(null)
    const { result } = renderHook(() => useUnderlay())
    await waitFor(() => expect(underlayService.fetchUnderlay).toHaveBeenCalledWith('p'))
    expect(underlayService.fetchFileObjectUrl).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('downloads the image named by the underlay', async () => {
    vi.mocked(underlayService.fetchUnderlay).mockResolvedValue({ fileId: 'f1', metresPerPixel: 0.02, widthPx: 300, heightPx: 200 })
    renderHook(() => useUnderlay())
    await waitFor(() => expect(underlayService.fetchFileObjectUrl).toHaveBeenCalledWith('p', 'f1'))
  })

  it('a failed underlay request is not an error', async () => {
    vi.mocked(underlayService.fetchUnderlay).mockRejectedValue(new Error('500'))
    const { result } = renderHook(() => useUnderlay())
    await waitFor(() => expect(underlayService.fetchUnderlay).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
