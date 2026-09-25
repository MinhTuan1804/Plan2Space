import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import Konva from 'konva'
import { Stage, Layer } from 'react-konva'
import { FurnitureLayer } from '../src/components/studio/Canvas2D/FurnitureLayer'
import { useGeometryStore } from '../src/stores/geometryStore'

describe('FurnitureLayer', () => {
  it('a rotated item turns its footprint but keeps its name upright', () => {
    useGeometryStore.setState({ furniture: [{ id: 'f1', catalogId: 'bed_double', x: 1, y: 1, rotationDeg: 90 }] })
    const stageRef = createRef<Konva.Stage>()
    render(<Stage width={400} height={400} ref={stageRef}><Layer><FurnitureLayer /></Layer></Stage>)

    const footprint = stageRef.current!.find('Rect')[0]
    const label = stageRef.current!.find('Text')[0]
    expect(footprint.getAbsoluteRotation()).toBeCloseTo(-90)
    expect(label.getAbsoluteRotation()).toBeCloseTo(0)
  })
})
