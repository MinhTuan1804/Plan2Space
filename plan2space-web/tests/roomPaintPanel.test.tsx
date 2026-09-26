import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomPanel } from '../src/components/studio/Canvas2D/RoomPanel'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('wall paint in the room panel', () => {
  it('a swatch paints the room, "Mặc định" goes back to the default paint', () => {
    useGeometryStore.setState({ walls: [], openings: [], furniture: [],
      rooms: [{ id: 'r1', label: 'Phòng ngủ', version: 1, points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 0 }] }] })
    render(<RoomPanel roomId="r1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Màu tường Xanh mint' }))
    expect(useGeometryStore.getState().rooms[0].wallColor).toBe('#CFE3D4')
    fireEvent.click(screen.getByRole('button', { name: 'Mặc định' }))
    expect(useGeometryStore.getState().rooms[0].wallColor).toBeUndefined()
  })
})
