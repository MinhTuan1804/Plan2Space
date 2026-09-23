import React from 'react'
import { Rect } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'

const PIXELS_PER_METER = 50

export function OpeningLayer() {
  const openings = useGeometryStore((s) => s.openings)

  return (
    <>
      {openings.map((o) => (
        <Rect
          key={o.id}
          x={o.position.x * PIXELS_PER_METER - (o.widthMeters * PIXELS_PER_METER) / 2}
          y={o.position.y * PIXELS_PER_METER - 4}
          width={o.widthMeters * PIXELS_PER_METER}
          height={8}
          fill={o.type === 'Door' ? '#f59e0b' : '#38bdf8'}
        />
      ))}
    </>
  )
}
