import React from 'react'
import { useGeometryStore } from '../../../stores/geometryStore'

// Shown for a selected door: which way it swings is chosen automatically (into the room); this flips it.
export function DoorPanel({ openingId }: { openingId: string }) {
  const door = useGeometryStore((s) => s.openings.find((o) => o.id === openingId && o.type === 'Door'))
  const flipDoorSwing = useGeometryStore((s) => s.flipDoorSwing)
  if (!door) return null
  return (
    <div className="absolute right-4 top-4 z-20 w-56 rounded-lg border border-zinc-800 bg-[#121215]/95 p-3 text-xs text-zinc-200">
      <div className="mb-2 text-zinc-400">Cửa đi · {door.widthMeters.toFixed(2)} m</div>
      <button className="w-full rounded bg-amber-600 px-2 py-1 text-white" onClick={() => flipDoorSwing(door.id)}>
        Đảo chiều mở cửa
      </button>
      <div className="mt-2 text-zinc-500">{door.swingFlipped ? 'Đã đảo chiều' : 'Tự động: mở vào trong phòng'}</div>
    </div>
  )
}
