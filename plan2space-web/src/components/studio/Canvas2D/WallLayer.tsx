import React from 'react'
import { Circle, Line } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { snapPoint } from './SnapEngine'
import { PIXELS_PER_METER, screenDeltaToPlan, screenToPlan, toScreen } from './canvasTransform'
import { WALL_SNAP_M } from './useWallTool'

export { PIXELS_PER_METER }

const HANDLE_RADIUS_PX = 7

export function WallLayer() {
  const walls = useGeometryStore((s) => s.walls)
  const updateWall = useGeometryStore((s) => s.updateWall)
  const moveWallPoint = useGeometryStore((s) => s.moveWallPoint)
  const tool = useEditorStore((s) => s.tool)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const editable = tool === 'select'

  return (
    <>
      {walls.map((wall) => {
        const selected = selection?.kind === 'wall' && selection.id === wall.id
        return (
          <React.Fragment key={wall.id}>
            <Line
              wallId={wall.id}
              points={wall.points.flatMap((p) => { const s = toScreen(p); return [s.x, s.y] })}
              stroke={selected ? '#60a5fa' : '#e2e8f0'}
              strokeWidth={wall.thicknessMeters * PIXELS_PER_METER}
              lineCap="square"
              lineJoin="miter"
              listening={editable}
              draggable={editable}
              onClick={() => select({ kind: 'wall', id: wall.id })}
              onTap={() => select({ kind: 'wall', id: wall.id })}
              onDragEnd={(e) => {
                const delta = screenDeltaToPlan(e.target.x(), e.target.y())
                const rawPoints = wall.points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }))
                const snapped = rawPoints.map((p) => snapPoint(p, useGeometryStore.getState().walls, wall.id))
                updateWall(wall.id, snapped)
                e.target.position({ x: 0, y: 0 })
              }}
            />
            {selected && editable && wall.points.map((p, index) => {
              const s = toScreen(p)
              return (
                <Circle
                  key={index}
                  x={s.x}
                  y={s.y}
                  radius={HANDLE_RADIUS_PX}
                  fill="#0d0d10"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e) => {
                    const target = snapPoint(screenToPlan({ x: e.target.x(), y: e.target.y() }),
                      useGeometryStore.getState().walls, wall.id, { endpointToleranceM: WALL_SNAP_M })
                    moveWallPoint(wall.id, index, target)
                  }}
                />
              )
            })}
          </React.Fragment>
        )
      })}
    </>
  )
}
