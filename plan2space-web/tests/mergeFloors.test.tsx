import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useGeometryStore } from '../src/stores/geometryStore'
import * as geometryService from '../src/services/geometryService'
import { MergeFloorsDialog } from '../src/components/studio/MergeFloorsDialog'
import { Wall } from '../src/services/geometryService'
import { levelOf } from '../src/lib/levels'

vi.mock('../src/services/geometryService')

const rect = (id: string, x0: number, y0: number, x1: number, y1: number): Wall[] => [
  [[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]],
].map(([a, b], i) => ({ id: `${id}${i}`, points: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }], thicknessMeters: 0.22, heightMeters: 3, version: 1 }))

function load(upperW = 30) {
  useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false, saveConflict: false,
    walls: [...rect('g', 0, 0, 10, 13.6), ...rect('f', 20, 0, upperW, 13.6)], rooms: [], openings: [], furniture: [] })
}

describe('merge floors', () => {
  beforeEach(() => { localStorage.clear(); vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 }); load() })

  it('the store action stacks the upper house as level 1 and saves once', async () => {
    expect(await useGeometryStore.getState().mergeLevels([3.6, 3.5])).toBeNull()
    const f0 = useGeometryStore.getState().walls.find((w) => w.id === 'f0')!
    expect(f0.points[0].x).toBeCloseTo(0); expect(levelOf(f0)).toBe(1)
    expect(vi.mocked(geometryService.saveGeometry)).toHaveBeenCalledTimes(1)
  })

  it('swap makes the right house the ground floor', async () => {
    await useGeometryStore.getState().mergeLevels([3.6, 3.5], true)
    const g0 = useGeometryStore.getState().walls.find((w) => w.id === 'g0')!
    expect(levelOf(g0)).toBe(1); expect(g0.points[0].x).toBeCloseTo(20)
  })

  it('a failed save puts the plan back and returns the server message', async () => {
    vi.mocked(geometryService.saveGeometry).mockRejectedValue({ response: { status: 400, data: { message: 'nope' } } })
    const before = useGeometryStore.getState().walls
    expect(await useGeometryStore.getState().mergeLevels([3.6, 3.5])).toBe('nope')
    expect(useGeometryStore.getState().walls).toEqual(before)
  })

  it('the dialog names the floors, swaps, validates heights and merges', async () => {
    const merge = vi.spyOn(useGeometryStore.getState(), 'mergeLevels').mockResolvedValue(null)
    render(<MergeFloorsDialog onClose={() => {}} />)
    expect(screen.getByText(/Tầng 1: khối trái/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Đảo' }))
    expect(screen.getByText(/Tầng 1: khối phải/)).toBeTruthy()
    const [h1, h2] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(h1.value).toBe('3.6'); expect(h2.value).toBe('3.5')
    fireEvent.change(h1, { target: { value: '7' } })
    expect((screen.getByRole('button', { name: 'Ghép' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(h1, { target: { value: '3.6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ghép' }))
    expect(merge).toHaveBeenCalledWith([3.6, 3.5], true)
  })

  it('warns when the two blocks do not look like floors of one house', () => {
    load(24)   // 4 x 13.6 = 54 m2 against 136 m2
    render(<MergeFloorsDialog onClose={() => {}} />)
    expect(screen.getByText(/không phải các tầng của cùng một nhà/)).toBeTruthy()
  })
})
