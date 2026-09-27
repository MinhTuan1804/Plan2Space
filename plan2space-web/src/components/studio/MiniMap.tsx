import React, { useMemo } from 'react'
import { Point, Room, Wall } from '../../services/geometryService'
import { mapTransform } from '../../lib/miniMap'

const SIZE = 200

// A small plan of one storey: where the viewer stands and looks (headingDeg clockwise from plan +y).
// Clicking reports the plan point; the caller decides whether to fly or step there.
export function MiniMap({ walls, rooms, marker, onPick, levels, level, onLevel }: {
  walls: Wall[]; rooms: Room[]; marker: { x: number; y: number; headingDeg: number } | null
  onPick: (p: Point) => void; levels?: number[]; level?: number; onLevel?: (level: number) => void
}) {
  const t = useMemo(() => {
    const pts = [...walls.flatMap((w) => w.points), ...rooms.flatMap((r) => r.points)]
    if (pts.length === 0) return null
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    return mapTransform({ minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }, SIZE)
  }, [walls, rooms])
  if (!t) return null
  const path = (ps: Point[]) => ps.map((p, i) => { const q = t.toMap(p); return `${i ? 'L' : 'M'}${q.x},${q.y}` }).join(' ')
  const m = marker && t.toMap(marker)
  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-lg border border-zinc-800 bg-[#121215]/90 p-1">
      {levels && levels.length > 1 && onLevel && (
        <div className="mb-1 flex gap-1 text-[11px]">
          {levels.map((l) => (
            <button key={l} onClick={() => onLevel(l)}
                    className={`rounded px-2 ${l === level ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'}`}>Tầng {l + 1}</button>
          ))}
        </div>
      )}
      <svg data-testid="minimap" width={SIZE} height={SIZE} className="cursor-crosshair"
           onClick={(e) => {
             const r = e.currentTarget.getBoundingClientRect()
             onPick(t.toPlan({ x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE }))
           }}>
        {rooms.map((r) => <path key={r.id} data-testid="minimap-room" d={path(r.points)} fill="#27272a" stroke="none" />)}
        {walls.map((w) => <path key={w.id} d={path(w.points)} stroke="#a1a1aa" strokeWidth={1.5} fill="none" />)}
        {m && (
          <polygon points="0,-8 5,6 -5,6" fill="#3b82f6" stroke="#fff" strokeWidth={1}
                   transform={`translate(${m.x},${m.y}) rotate(${marker!.headingDeg})`} />
        )}
      </svg>
    </div>
  )
}
