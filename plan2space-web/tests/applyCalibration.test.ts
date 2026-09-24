import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyCalibration, retryUnderlayScale } from '../src/components/studio/Canvas2D/applyCalibration'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorStore } from '../src/stores/editorStore'
import * as geometryService from '../src/services/geometryService'
import * as underlayService from '../src/services/underlayService'

vi.mock('../src/services/geometryService')
vi.mock('../src/services/underlayService')

describe('applying a calibration', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(underlayService.setUnderlayScale).mockReset().mockResolvedValue()
    useEditorStore.setState({ underlayRevision: 0 })
    useGeometryStore.setState({
      projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false, saveConflict: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 34, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: [],
    })
  })

  it('scales the plan, saves it, then corrects the underlay and refreshes it', async () => {
    const error = await applyCalibration(7 / 34, 0.0742)

    expect(error).toBeNull()
    expect(vi.mocked(geometryService.saveGeometry).mock.calls[0][2].walls[0].points[1].x).toBeCloseTo(7)
    expect(underlayService.setUnderlayScale).toHaveBeenCalledWith('p', expect.closeTo(0.0742 * 7 / 34, 6))
    expect(useEditorStore.getState().underlayRevision).toBe(1)
  })

  it('calibrating twice compounds on the corrected underlay value', async () => {
    await applyCalibration(0.5, 0.08)
    await applyCalibration(0.5, 0.04)
    expect(vi.mocked(underlayService.setUnderlayScale).mock.calls[1][1]).toBeCloseTo(0.02)
  })

  it('a plan without an underlay is only scaled and saved', async () => {
    expect(await applyCalibration(0.5, null)).toBeNull()
    expect(underlayService.setUnderlayScale).not.toHaveBeenCalled()
  })

  it('when the save conflicts the underlay is left alone and the user is told', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 409 } })

    const error = await applyCalibration(0.5, 0.08)

    expect(error).toMatch(/changed/i)
    expect(underlayService.setUnderlayScale).not.toHaveBeenCalled()
  })
})

describe('calibration failure paths (review findings)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(underlayService.setUnderlayScale).mockReset().mockResolvedValue()
    useEditorStore.setState({ underlayRevision: 0, pendingUnderlayMpp: null })
    useGeometryStore.setState({
      projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false, saveConflict: false,
      walls: [{ id: 'w1', points: [{ x: 0, y: 0 }, { x: 34, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 }],
      rooms: [], openings: [],
    })
  })

  it('a second Apply while the first is in flight scales nothing more', async () => {
    const first = applyCalibration(0.5, 0.08)
    const second = await applyCalibration(0.5, 0.08)
    await first
    expect(second).toMatch(/already/i)
    expect(useGeometryStore.getState().walls[0].points[1].x).toBeCloseTo(17)
    expect(geometryService.saveGeometry).toHaveBeenCalledTimes(1)
  })

  it('a failed save puts the plan back the way it was', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 422, data: { message: 'overlap' } } })
    const error = await applyCalibration(0.5, 0.08)
    expect(error).toBeTruthy()
    expect(useGeometryStore.getState().walls[0].points[1].x).toBe(34)
    expect(useGeometryStore.getState().dirty).toBe(false)
  })

  it('a conflicting save puts the plan back the way it was', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 409 } })
    await applyCalibration(0.5, 0.08)
    expect(useGeometryStore.getState().walls[0].points[1].x).toBe(34)
  })

  it('when the image cannot be realigned, the correction is kept so it can be retried', async () => {
    vi.mocked(underlayService.setUnderlayScale).mockRejectedValueOnce(new Error('503'))
    const error = await applyCalibration(0.5, 0.08)
    expect(error).toMatch(/retry/i)
    expect(useEditorStore.getState().pendingUnderlayMpp).toBeCloseTo(0.04)

    expect(await retryUnderlayScale()).toBeNull()
    expect(vi.mocked(underlayService.setUnderlayScale).mock.calls[1]).toEqual(['p', expect.closeTo(0.04, 6)])
    expect(useEditorStore.getState().pendingUnderlayMpp).toBeNull()
  })
})
