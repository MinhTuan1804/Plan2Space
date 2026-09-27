import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { doorOpenFraction, lightOn, roomLight } from '../src/lib/interaction'
import { InfoCard } from '../src/components/studio/Viewer3D/InfoCard'
import { useEditorStore } from '../src/stores/editorStore'
import { useGeometryStore } from '../src/stores/geometryStore'
import { Room } from '../src/services/geometryService'

const room: Room = { id: 'r', label: 'LIVING', version: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }] }

describe('doors and lights', () => {
  it('a door swings with a smoothstep over its time', () => {
    expect([doorOpenFraction(0, 0.6), doorOpenFraction(0.3, 0.6), doorOpenFraction(0.6, 0.6), doorOpenFraction(2, 0.6)]).toEqual([0, 0.5, 1, 1])
  })
  it('a light follows the switch, otherwise the night', () => {
    expect(lightOn('r', new Map([['r', true]]), false)).toBe(true)
    expect(lightOn('r', new Map([['r', false]]), true)).toBe(false)
    expect(lightOn('r', new Map(), true)).toBe(true)
    expect(lightOn('r', new Map(), false)).toBe(false)
  })
  it('a room light hangs 0.3 m below the ceiling and reaches 1.5 × the room', () => {
    const l = roomLight(room, 3.6)
    expect(l.position[2]).toBeCloseTo(3.3)
    expect(l.distance).toBeCloseTo(6)
  })
})

describe('the info card switches', () => {
  beforeEach(() => {
    cleanup()
    useEditorStore.setState({ openDoors: new Set(), lightsOverride: new Map() })
    useGeometryStore.setState({
      rooms: [room], furniture: [],
      openings: [{ id: 'o', wallId: 'w', type: 'Door', position: { x: 0, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }],
    })
  })
  it('opens and closes a door', () => {
    useEditorStore.setState({ picked: { kind: 'opening', id: 'o' } })
    render(<InfoCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Mở cửa' }))
    expect(useEditorStore.getState().openDoors.has('o')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Đóng cửa' }))
    expect(useEditorStore.getState().openDoors.has('o')).toBe(false)
  })
  it('switches a room light', () => {
    useEditorStore.setState({ picked: { kind: 'room', id: 'r' }, sunHour: 12, sunDate: '2026-06-21' })
    render(<InfoCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Bật đèn' }))
    expect(useEditorStore.getState().lightsOverride.get('r')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Tắt đèn' }))
    expect(useEditorStore.getState().lightsOverride.get('r')).toBe(false)
  })
})
