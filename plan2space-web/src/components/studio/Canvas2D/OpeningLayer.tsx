import React from 'react'
import { Rect } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { Opening, Wall } from '../../../services/geometryService'
import { PIXELS_PER_METER, toScreen } from './canvasTransform'

const SYMBOL_DEPTH_PX = 8

// Screen-space angle (degrees) of the wall segment nearest the opening.
function screenAngleDeg(opening: Opening, walls: Wall[]): number {
  const wall = walls.find((w) => w.id === opening.wallId)
  if (!wall) return 0
  let best = { distance: Infinity, angle: 0 }
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = toScreen(wall.points[i])
    const b = toScreen(wall.points[i + 1])
    const p = toScreen(opening.position)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (distance < best.distance) best = { distance, angle: (Math.atan2(dy, dx) * 180) / Math.PI }
  }
  return best.angle
}

export function OpeningLayer() {
  const openings = useGeometryStore((s) => s.openings)
  const walls = useGeometryStore((s) => s.walls)
  const tool = useEditorStore((s) => s.tool)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)

  return (
    <>
      {openings.map((o) => {
        const center = toScreen(o.position)
        const width = o.widthMeters * PIXELS_PER_METER
        return (
          <Rect
            key={o.id}
            x={center.x}
            y={center.y}
            width={width}
            height={SYMBOL_DEPTH_PX}
            offsetX={width / 2}
            offsetY={SYMBOL_DEPTH_PX / 2}
            rotation={screenAngleDeg(o, walls)}
            fill={o.type === 'Door' ? '#f59e0b' : '#38bdf8'}
            listening={tool === 'select'}
            onClick={() => select({ kind: 'opening', id: o.id })}
            onTap={() => select({ kind: 'opening', id: o.id })}
            stroke={selection?.kind === 'opening' && selection.id === o.id ? '#ffffff' : undefined}
            strokeWidth={2}
          />
        )
      })}
    </>
  )
}
