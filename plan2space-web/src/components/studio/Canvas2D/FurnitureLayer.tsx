import React from 'react'
import { Group, Line, Rect, Text } from 'react-konva'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { useCatalog } from '../../../services/catalogService'
import { PIXELS_PER_METER, screenToPlan, toScreen } from './canvasTransform'

// A catalog id with no entry (the catalog changed since the plan was saved) is kept and drawn grey.
const UNKNOWN = { name: '?', widthM: 0.5, depthM: 0.5 }

// Footprints in plan space. Screen y points down, so a CCW plan rotation is a CW screen rotation.
export function FurnitureLayer() {
  const furniture = useGeometryStore((s) => s.furniture)
  const moveFurniture = useGeometryStore((s) => s.moveFurniture)
  const tool = useEditorStore((s) => s.tool)
  const selection = useEditorStore((s) => s.selection)
  const select = useEditorStore((s) => s.select)
  const catalog = useCatalog()
  const editable = tool === 'select'

  return (
    <>
      {furniture.map((f) => {
        const known = catalog?.byId[f.catalogId]
        const entry = known ?? UNKNOWN
        const w = entry.widthM * PIXELS_PER_METER
        const d = entry.depthM * PIXELS_PER_METER
        const at = toScreen({ x: f.x, y: f.y })
        const selected = selection?.kind === 'furniture' && selection.id === f.id
        const colour = known ? '#eab308' : '#71717a'
        // The name stays upright and spans the rotated footprint's on-screen width.
        const a = (f.rotationDeg * Math.PI) / 180
        const labelWidth = Math.abs(w * Math.cos(a)) + Math.abs(d * Math.sin(a))
        return (
          <Group
            key={f.id}
            x={at.x}
            y={at.y}
            draggable={editable}
            listening={editable}
            onClick={() => select({ kind: 'furniture', id: f.id })}
            onTap={() => select({ kind: 'furniture', id: f.id })}
            onDragEnd={(e) => {
              const p = screenToPlan({ x: e.target.x(), y: e.target.y() })
              moveFurniture(f.id, p.x, p.y)
            }}
          >
            <Group rotation={-f.rotationDeg}>
              <Rect x={-w / 2} y={-d / 2} width={w} height={d}
                    fill={known ? 'rgba(234, 179, 8, 0.18)' : 'rgba(113, 113, 122, 0.35)'}
                    stroke={selected ? '#ffffff' : colour} strokeWidth={selected ? 2 : 1} />
              {/* Front edge: local -y in plan is screen +y at rotation 0. */}
              <Line points={[-w / 2, d / 2, w / 2, d / 2]} stroke={colour} strokeWidth={3} listening={false} />
            </Group>
            <Text x={-labelWidth / 2} y={-6} width={labelWidth} align="center" text={entry.name} fontSize={10} fill="#fde68a" listening={false} />
          </Group>
        )
      })}
    </>
  )
}
