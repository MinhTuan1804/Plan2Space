import React from 'react'
import { Line } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { snapPoint } from './SnapEngine'

export const PIXELS_PER_METER = 50

export function WallLayer() {
  const walls = useGeometryStore((s) => s.walls)
  const updateWall = useGeometryStore((s) => s.updateWall)

  return (
    <>
      {walls.map((wall) => (
        <Line
          key={wall.id}
          points={wall.points.flatMap((p) => [p.x * PIXELS_PER_METER, p.y * PIXELS_PER_METER])}
          stroke="#e2e8f0"
          strokeWidth={wall.thicknessMeters * PIXELS_PER_METER}
          lineCap="square"
          lineJoin="miter"
          draggable
          onDragEnd={(e) => {
            const dx = e.target.x() / PIXELS_PER_METER
            const dy = e.target.y() / PIXELS_PER_METER
            const rawPoints = wall.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
            const snapped = rawPoints.map((p) => snapPoint(p, useGeometryStore.getState().walls, wall.id))
            updateWall(wall.id, snapped)
            e.target.position({ x: 0, y: 0 })
          }}
        />
      ))}
    </>
  )
}
