import React, { useState } from 'react'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useCatalog } from '../../../services/catalogService'
import { labelFor, ROOM_TYPES, roomTypeOf, RoomType } from '../../../lib/roomTypes'
import { autoFurnishRoom } from '../../../lib/furnish'

// Common wall paints; the colour input allows any other.
export const WALL_PAINTS: { name: string; hex: string }[] = [
  { name: 'Trắng ngà', hex: '#F4F1EA' }, { name: 'Trắng', hex: '#FFFFFF' }, { name: 'Xám nhạt', hex: '#D9D9D6' },
  { name: 'Be', hex: '#E8DCC8' }, { name: 'Kem', hex: '#F3E9D2' }, { name: 'Xanh mint', hex: '#CFE3D4' },
  { name: 'Xanh dương nhạt', hex: '#CFDDEA' }, { name: 'Hồng phấn', hex: '#F0D9D6' }, { name: 'Vàng nhạt', hex: '#F2E6B8' },
  { name: 'Xanh rêu', hex: '#9DAF8F' },
]

export function RoomPanel({ roomId }: { roomId: string }) {
  const room = useGeometryStore((s) => s.rooms.find((r) => r.id === roomId))
  const updateRoomLabel = useGeometryStore((s) => s.updateRoomLabel)
  const setRoomWallColor = useGeometryStore((s) => s.setRoomWallColor)
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
      <div className="mt-3 border-t border-zinc-800 pt-2">
        <span className="mb-1 block text-zinc-400">Màu tường</span>
        <div className="grid grid-cols-5 gap-1">
          {WALL_PAINTS.map((p) => (
            <button key={p.hex} title={p.name} aria-label={`Màu tường ${p.name}`} onClick={() => setRoomWallColor(room.id, p.hex)}
                    className={`h-6 rounded border ${room.wallColor?.toUpperCase() === p.hex ? 'border-white' : 'border-zinc-700'}`}
                    style={{ backgroundColor: p.hex }} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input type="color" aria-label="Chọn màu tường khác" value={room.wallColor ?? '#efe9df'}
                 onChange={(e) => setRoomWallColor(room.id, e.target.value.toUpperCase())}
                 className="h-6 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent" />
          <button onClick={() => setRoomWallColor(room.id, null)} disabled={!room.wallColor}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300 disabled:opacity-40">Mặc định</button>
        </div>
      </div>
    </div>
  )
}
