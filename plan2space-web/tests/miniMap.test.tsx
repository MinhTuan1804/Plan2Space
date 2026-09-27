import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { mapTransform } from '../src/lib/miniMap'
import { MiniMap } from '../src/components/studio/MiniMap'
import { Room, Wall } from '../src/services/geometryService'

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 5 }

describe('minimap transform', () => {
  const t = mapTransform(bounds, 200)
  it('round-trips a plan point', () => {
    const q = t.toPlan(t.toMap({ x: 3.3, y: 1.7 }))
    expect(q.x).toBeCloseTo(3.3, 9); expect(q.y).toBeCloseTo(1.7, 9)
  })
  it('puts plan north (larger y) at the top, with a 5 % margin and the short side centred', () => {
    expect(t.toMap({ x: 0, y: 5 })).toEqual({ x: 10, y: 55 })
    expect(t.toMap({ x: 10, y: 0 })).toEqual({ x: 190, y: 145 })
  })
})

const box = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }]
const rooms: Room[] = [{ id: 'a', label: 'A', version: 1, points: box(0, 0, 5, 5) }, { id: 'b', label: 'B', version: 1, points: box(5, 0, 10, 5) }]
const walls: Wall[] = [{ id: 'w', version: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thicknessMeters: 0.2, heightMeters: 3 }]

describe('the minimap', () => {
  beforeEach(cleanup)
  it('draws each room and reports a click in plan coordinates', () => {
    const onPick = vi.fn()
    render(<MiniMap walls={walls} rooms={rooms} marker={{ x: 2, y: 2, headingDeg: 0 }} onPick={onPick} />)
    expect(screen.getAllByTestId('minimap-room')).toHaveLength(2)
    const svg = screen.getByTestId('minimap')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(svg, { clientX: 100, clientY: 100 })
    expect(onPick.mock.calls[0][0].x).toBeCloseTo(5); expect(onPick.mock.calls[0][0].y).toBeCloseTo(2.5)
  })
  it('offers the storeys only when there are two', () => {
    const onLevel = vi.fn()
    const { rerender } = render(<MiniMap walls={walls} rooms={rooms} marker={null} onPick={() => {}} levels={[0]} level={0} onLevel={onLevel} />)
    expect(screen.queryByRole('button', { name: 'Tầng 2' })).toBeNull()
    rerender(<MiniMap walls={walls} rooms={rooms} marker={null} onPick={() => {}} levels={[0, 1]} level={0} onLevel={onLevel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tầng 2' }))
    expect(onLevel).toHaveBeenCalledWith(1)
  })
})
