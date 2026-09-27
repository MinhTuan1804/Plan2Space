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

import { doorInSight } from '../src/lib/interaction'
import { Opening, Wall } from '../src/services/geometryService'

describe('the door in sight', () => {
  // A wall along y = 3 with a door at x = 2 and a window at x = 6; a second wall with a door along y = 5.
  const walls: Wall[] = [
    { id: 'w', version: 1, points: [{ x: 0, y: 3 }, { x: 10, y: 3 }], thicknessMeters: 0.2, heightMeters: 3 },
    { id: 'v', version: 1, points: [{ x: 0, y: 5 }, { x: 10, y: 5 }], thicknessMeters: 0.2, heightMeters: 3 },
  ]
  const op = (id: string, wallId: string, type: 'Door' | 'Window', x: number, y: number): Opening =>
    ({ id, wallId, type, position: { x, y }, widthMeters: 0.9, sillHeightMeters: type === 'Door' ? 0 : 0.9, version: 1 })
  const openings = [op('d', 'w', 'Door', 2, 3), op('win', 'w', 'Window', 6, 3), op('far', 'v', 'Door', 2, 5)]
  const eye = (x: number, y: number) => ({ x, y, h: 1.6 })
  const ahead = { x: 0, y: 1, h: 0 }

  it('finds the door straight ahead within reach', () => expect(doorInSight(eye(2, 1), ahead, openings, walls)).toBe('d'))
  it('nothing beyond 2.5 m', () => expect(doorInSight(eye(2, 0), ahead, openings, walls)).toBeNull())
  it('nothing when looking away', () => expect(doorInSight(eye(2, 1), { x: 0, y: -1, h: 0 }, openings, walls)).toBeNull())
  it('a window is not a door', () => expect(doorInSight(eye(6, 1), ahead, openings, walls)).toBeNull())
  it('the nearer of two doors in line', () => expect(doorInSight(eye(2, 2.5), ahead, openings, walls, 5)).toBe('d'))
  it('looking over the top of the door misses it', () => expect(doorInSight(eye(2, 1), { x: 0, y: 1, h: 1 }, openings, walls)).toBeNull())
})

import { lightPool, swingStep } from '../src/lib/interaction'

describe('a fixed pool of room lights', () => {
  const r = (id: string, level: number, side: number): Room => ({ id, label: id, version: 1, level,
    points: [{ x: 0, y: 0 }, { x: side, y: 0 }, { x: side, y: side }, { x: 0, y: side }, { x: 0, y: 0 }] })
  it('always the same number of lights, the viewed storey and larger rooms first', () => {
    const rooms = [r('small0', 0, 2), ...Array.from({ length: 9 }, (_, i) => r(`up${i}`, 1, 3 + i)), r('big0', 0, 6)]
    const pool = lightPool(rooms, 0, 8)
    expect(pool).toHaveLength(8)
    expect(pool.slice(0, 2).map((x) => x?.id)).toEqual(['big0', 'small0'])
    expect(pool[2]?.id).toBe('up8')
    expect(lightPool([r('a', 0, 3)], 0, 8).filter((x) => x === null)).toHaveLength(7)
  })
})

describe('a door swing step', () => {
  it('applies once at rest, then stays quiet until it moves', () => {
    expect(swingStep(0, false, 0.016, 0.6, false)).toEqual({ elapsed: 0, apply: true })
    expect(swingStep(0, false, 0.016, 0.6, true)).toEqual({ elapsed: 0, apply: false })
    expect(swingStep(0, true, 0.1, 0.6, true)).toEqual({ elapsed: 0.1, apply: true })
    expect(swingStep(0.6, true, 0.1, 0.6, true)).toEqual({ elapsed: 0.6, apply: false })
  })
})
