import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { WallLayer } from '../src/components/studio/Canvas2D/WallLayer'
import { OpeningLayer } from '../src/components/studio/Canvas2D/OpeningLayer'
import { toScreen, screenDeltaToPlan } from '../src/components/studio/Canvas2D/canvasTransform'
import { useGeometryStore } from '../src/stores/geometryStore'

// Project space is y-up (DXF, and the AI pipeline flips raster y); Konva's screen y grows downward.
describe('2D canvas orientation', () => {
  beforeEach(() =>
    useGeometryStore.setState({
      walls: [
        { id: 'h', points: [{ x: 0, y: 1 }, { x: 5, y: 1 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
        { id: 'v', points: [{ x: 5, y: 0 }, { x: 5, y: 4 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
      ],
      rooms: [],
      openings: [{ id: 'o', wallId: 'v', type: 'Door', position: { x: 5, y: 2 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1 }],
      version: 1,
    })
  )

  it('maps plan y-up to screen y-down', () => {
    expect(toScreen({ x: 2, y: 1 })).toEqual({ x: 100, y: -50 })
    expect(screenDeltaToPlan(0, -50)).toEqual({ x: 0, y: 1 })
  })

  function renderStage() {
    const stageRef = createRef<Konva.Stage>()
    render(
      <Stage width={400} height={400} ref={stageRef}>
        <Layer>
          <WallLayer />
          <OpeningLayer />
        </Layer>
      </Stage>
    )
    return stageRef.current!
  }

  it('draws a wall at plan y=1 above the origin on screen', () => {
    const stage = renderStage()
    const line = stage.find('Line').find((n) => n.getAttr('wallId') === 'h') as Konva.Line
    expect(line.points()).toEqual([0, -50, 250, -50])
  })

  it('dragging a wall up on screen moves it to a larger plan y', () => {
    const stage = renderStage()
    const line = stage.find('Line').find((n) => n.getAttr('wallId') === 'h') as Konva.Line
    line.position({ x: 0, y: -50 })
    line.fire('dragend')
    const moved = useGeometryStore.getState().walls.find((w) => w.id === 'h')!
    expect(moved.points).toEqual([{ x: 0, y: 2 }, { x: 5, y: 2 }])
  })

  it('draws an opening along its wall direction', () => {
    const stage = renderStage()
    const rect = stage.find('Rect')[0] as Konva.Rect
    expect(Math.abs(rect.rotation())).toBeCloseTo(90, 3)
    expect(rect.x()).toBeCloseTo(250, 3)
    expect(rect.y()).toBeCloseTo(-100, 3)
  })
})
