import React from 'react'
import { Line, Text } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { Point } from '../../../services/geometryService'
import { toScreen } from './canvasTransform'

const LABEL_WIDTH_PX = 140

function area(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length - 1; i++) sum += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y
  return Math.abs(sum) / 2
}

function centre(points: Point[]): Point {
  const distinct = points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y
    ? points.slice(0, -1) : points
  return {
    x: distinct.reduce((s, p) => s + p.x, 0) / distinct.length,
    y: distinct.reduce((s, p) => s + p.y, 0) / distinct.length,
  }
}

// Room outlines (drawn under the walls) with their label and area.
export function RoomLayer() {
  const rooms = useGeometryStore((s) => s.rooms)
  const tool = useEditorStore((s) => s.tool)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)

  return (
    <>
      {rooms.map((room) => {
        const label = toScreen(centre(room.points))
        const selected = selection?.kind === 'room' && selection.id === room.id
        return (
          <React.Fragment key={room.id}>
            <Line
              points={room.points.flatMap((p) => {
                const s = toScreen(p)
                return [s.x, s.y]
              })}
              closed
              fill="rgba(59, 130, 246, 0.08)"
              stroke={selected ? 'rgba(59, 130, 246, 0.9)' : 'rgba(59, 130, 246, 0.35)'}
              strokeWidth={selected ? 2 : 1}
              // Clicking a room (not a wall or furniture on top of it) opens its type and Auto-furnish panel.
              listening={tool === 'select'}
              onClick={() => select({ kind: 'room', id: room.id })}
              onTap={() => select({ kind: 'room', id: room.id })}
            />
            <Text
              x={label.x}
              y={label.y}
              offsetX={LABEL_WIDTH_PX / 2}
              offsetY={8}
              width={LABEL_WIDTH_PX}
              align="center"
              text={`${room.label}\n${area(room.points).toFixed(1)} m²`}
              fontSize={11}
              fill="#93c5fd"
              listening={false}
            />
          </React.Fragment>
        )
      })}
    </>
  )
}
