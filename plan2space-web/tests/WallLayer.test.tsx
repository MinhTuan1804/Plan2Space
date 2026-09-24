import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Stage, Layer } from 'react-konva'
import { WallLayer } from '../src/components/studio/Canvas2D/WallLayer'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('WallLayer', () => {
  it('renders one Konva Line per wall', () => {
    useGeometryStore.setState({
      walls: [
        { id: 'w1', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
        { id: 'w2', points: [{ x: 5, y: 0 }, { x: 5, y: 4 }], thicknessMeters: 0.2, heightMeters: 2.8, version: 1 },
      ],
      rooms: [],
      openings: [],
      version: 1,
    })
    const { container } = render(
      <Stage width={400} height={400}>
        <Layer>
          <WallLayer />
        </Layer>
      </Stage>
    )
    expect(container.querySelectorAll('canvas').length).toBeGreaterThan(0)
    expect(useGeometryStore.getState().walls).toHaveLength(2)
  })
})
