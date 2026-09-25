import React, { useState } from 'react'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useCatalog } from '../../../services/catalogService'
import { labelFor, ROOM_TYPES, roomTypeOf, RoomType } from '../../../lib/roomTypes'
import { autoFurnishRoom } from '../../../lib/furnish'

export function RoomPanel({ roomId }: { roomId: string }) {
  const room = useGeometryStore((s) => s.rooms.find((r) => r.id === roomId))
  const updateRoomLabel = useGeometryStore((s) => s.updateRoomLabel)
  const catalog = useCatalog()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!room) return null
  const type = roomTypeOf(room.label)

  return (
    <div className="absolute right-4 top-4 z-20 w-56 rounded-lg border border-zinc-800 bg-[#121215]/95 p-3 text-xs text-zinc-200">
      <label className="mb-2 block">
        <span className="mb-1 block text-zinc-400">Room type</span>
        <select aria-label="Room type" value={type ?? ''} className="w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1"
                onChange={(e) => e.target.value && updateRoomLabel(room.id, labelFor(e.target.value as RoomType))}>
          <option value="">— choose —</option>
          {ROOM_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      </label>
      <button disabled={!type || !catalog || busy} className="w-full rounded bg-yellow-600 px-2 py-1 text-white disabled:bg-zinc-700"
              onClick={async () => { setBusy(true); setMessage(await autoFurnishRoom(room.id, catalog!)); setBusy(false) }}>
        {busy ? 'Furnishing…' : 'Auto-furnish'}
      </button>
      {message && <div role="alert" className="mt-2 text-amber-400">{message}</div>}
    </div>
  )
}
