import React from 'react'
import { useCatalog } from '../../../services/catalogService'
import { useEditorStore } from '../../../stores/editorStore'
import { ROOM_TYPES } from '../../../lib/roomTypes'

export function FurnitureLibrary() {
  const catalog = useCatalog()
  const pending = useEditorStore((s) => s.pendingCatalogId)
  const setPending = useEditorStore((s) => s.setPendingCatalogId)
  if (!catalog) return <div className="absolute right-4 top-4 z-20 rounded bg-zinc-900 p-3 text-xs text-zinc-400">Loading furniture…</div>
  return (
    <div className="absolute right-4 top-4 z-20 max-h-[70%] w-56 overflow-y-auto rounded-lg border border-zinc-800 bg-[#121215]/95 p-2 text-xs text-zinc-200">
      <div className="mb-1 px-1 text-zinc-400">Pick an item, then click the plan</div>
      {ROOM_TYPES.map(({ type, label }) => (
        <div key={type} className="mb-2">
          <div className="px-1 py-0.5 font-semibold text-zinc-300">{label}</div>
          {catalog.items.filter((i) => i.roomTypes.includes(type)).map((i) => (
            <button key={i.id} onClick={() => setPending(i.id)}
                    className={`block w-full rounded px-2 py-1 text-left ${pending === i.id ? 'bg-yellow-600/30 text-white' : 'hover:bg-zinc-800'}`}>
              {i.name} <span className="text-zinc-500">{i.widthM}×{i.depthM} m</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
