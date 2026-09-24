import React from 'react'
import { Line } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { snapPoint } from './SnapEngine'
import { PIXELS_PER_METER, screenDeltaToPlan, toScreen } from './canvasTransform'

export { PIXELS_PER_METER }

export function WallLayer() {
  const walls = useGeometryStore((s) => s.walls)
  const updateWall = useGeometryStore((s) => s.updateWall)

  return (
    <>
      {walls.map((wall) => (
        <Line
          key={wall.id}
          wallId={wall.id}
          points={wall.points.flatMap((p) => {
            const s = toScreen(p)
            return [s.x, s.y]
          })}
          stroke="#e2e8f0"
          strokeWidth={wall.thicknessMeters * PIXELS_PER_METER}
          lineCap="square"
          lineJoin="miter"
          draggable
          onDragEnd={(e) => {
            const delta = screenDeltaToPlan(e.target.x(), e.target.y())
            const rawPoints = wall.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
            const snapped = rawPoints.map((p) => snapPoint(p, useGeometryStore.getState().walls, wall.id))
            updateWall(wall.id, snapped)
            e.target.position({ x: 0, y: 0 })
          }}
        />
      ))}
    </>
  )
}
