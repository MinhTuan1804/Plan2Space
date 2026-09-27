import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { WallLayer } from '../src/components/studio/Canvas2D/WallLayer'
import { useGeometryStore } from '../src/stores/geometryStore'
import { useEditorStore } from '../src/stores/editorStore'
import * as geometryService from '../src/services/geometryService'
import { Wall, Room } from '../src/services/geometryService'
import { levelOf } from '../src/lib/levels'
import { StudioToolbar } from '../src/components/studio/StudioToolbar'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/services/geometryService')

const wall = (id: string, level: number, y = 0): Wall =>
  ({ id, points: [{ x: 0, y }, { x: 5, y }], thicknessMeters: 0.2, heightMeters: 3, version: 1, level })
const room = (id: string, level: number): Room =>
  ({ id, label: 'Phòng ngủ', level, version: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }] })

function wallLines(): number {
  const ref = createRef<Konva.Stage>()
  const { unmount } = render(<Stage width={400} height={400} ref={ref}><Layer><WallLayer /></Layer></Stage>)
  const n = ref.current!.find('Line').filter((l) => l.getAttr('listening') !== false || true).length
  unmount()
  return n
}

describe('editing one level at a time', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(geometryService.saveGeometry).mockReset().mockResolvedValue({ version: 2 })
    vi.mocked(geometryService.deriveRooms).mockReset()
    useGeometryStore.setState({ projectId: 'p', version: 1, dirty: false, wallsEdited: false, roomsRefreshFailed: false, saveConflict: false,
      walls: [wall('a', 0), wall('b', 0, 2), wall('c', 1)], rooms: [room('r0', 0), room('r1', 1)], openings: [], furniture: [] })
  })

  it('the wall layer shows only the current level', () => {
    useEditorStore.getState().setLevel(0)
    const onGround = wallLines()
    useEditorStore.getState().setLevel(1)
    const upstairs = wallLines()
    expect(onGround).toBeGreaterThan(upstairs)
    expect(upstairs).toBeGreaterThan(0)
  })

  it('new walls take the level being edited', () => {
    const id = useGeometryStore.getState().addWall([{ x: 0, y: 5 }, { x: 3, y: 5 }], 1)
    expect(levelOf(useGeometryStore.getState().walls.find((w) => w.id === id)!)).toBe(1)
  })

  it('rooms are derived per level: editing level 1 keeps the level-0 rooms', async () => {
    vi.mocked(geometryService.deriveRooms).mockImplementation(async (walls) =>
      walls.every((w) => levelOf(w) === 1) ? [{ points: room('x', 1).points, label: 'Room 1' }] : [{ points: room('x', 0).points, label: 'Room 1' }])
    useGeometryStore.setState({ wallsEdited: true })
    await useGeometryStore.getState().saveToServer('p')
    expect(vi.mocked(geometryService.deriveRooms)).toHaveBeenCalledTimes(2)
    for (const call of vi.mocked(geometryService.deriveRooms).mock.calls)
      expect(new Set(call[0].map(levelOf)).size).toBe(1)
    const rooms = useGeometryStore.getState().rooms
    expect(rooms.filter((r) => levelOf(r) === 0)).toHaveLength(1)
    expect(rooms.filter((r) => levelOf(r) === 1)).toHaveLength(1)
    expect(rooms.find((r) => levelOf(r) === 0)!.label).toBe('Phòng ngủ')   // carried over from its own level
  })

  it('the toolbar offers the level switch only for a multi-level plan', () => {
    render(<MemoryRouter><StudioToolbar projectId="p" /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Tầng 2' }))
    expect(useEditorStore.getState().level).toBe(1)
  })

  it('opening another project goes back to the ground floor', async () => {
    useEditorStore.getState().setLevel(1)
    vi.mocked(geometryService.fetchGeometry).mockResolvedValue({ walls: [wall('x', 0)], rooms: [], openings: [], furniture: [], version: 1 })
    await useGeometryStore.getState().loadFromServer('other')
    expect(useEditorStore.getState().level).toBe(0)
  })

  it('a level that no longer has walls is left for one that does', () => {
    useEditorStore.getState().setLevel(1)
    useGeometryStore.setState({ walls: [wall('a', 0)] })          // every level-1 wall deleted
    render(<MemoryRouter><StudioToolbar projectId="p" /></MemoryRouter>)
    expect(useEditorStore.getState().level).toBe(0)
  })
})
