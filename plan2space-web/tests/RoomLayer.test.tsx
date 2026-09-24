import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { RoomLayer } from '../src/components/studio/Canvas2D/RoomLayer'
import { useGeometryStore } from '../src/stores/geometryStore'

// Final review I5: rooms from the AI pipeline must be visible in the 2D editor.
describe('RoomLayer', () => {
  it('draws each room as a filled closed outline (y-up) with its label', () => {
    useGeometryStore.setState({
      walls: [],
      openings: [],
      rooms: [{ id: 'r1', label: 'Phòng ngủ', version: 1,
                points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 0 }] }],
    })
    const stageRef = createRef<Konva.Stage>()
    render(<Stage width={400} height={400} ref={stageRef}><Layer><RoomLayer /></Layer></Stage>)

    const outline = stageRef.current!.find('Line')[0] as Konva.Line
    expect(outline.closed()).toBe(true)
    expect(outline.points()).toEqual([0, -0, 200, -0, 200, -150, 0, -150, 0, -0])
    const label = stageRef.current!.find('Text')[0] as Konva.Text
    expect(label.text()).toContain('Phòng ngủ')
    expect(label.text()).toContain('12.0 m²')
  })
})
