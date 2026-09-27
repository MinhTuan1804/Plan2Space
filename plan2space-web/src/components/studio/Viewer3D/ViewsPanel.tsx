import React, { useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { useEditorStore } from '../../../stores/editorStore'
import { useViewSettingsStore } from '../../../stores/viewSettingsStore'
import { ViewMarker } from './ViewTracker'

// Named viewpoints of the 3D view, saved with the project: save the current one, fly to one, rename, delete.
export function ViewsPanel({ current }: { current: ViewMarker | null }) {
  const { settings, update } = useViewSettingsStore()
  const setFlyTo = useEditorStore((s) => s.setFlyTo)
  const level = useEditorStore((s) => s.level)
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState<{ index: number | null; name: string } | null>(null)
  const views = settings.views

  const commit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = naming?.name.trim().slice(0, 60)
    if (!naming || !name) return setNaming(null)
    if (naming.index === null) {
      if (!current) return setNaming(null)
      update({ views: [...views, { name, level, position: current.camera, target: [current.x, current.y, current.targetHeight] }] })
    } else {
      update({ views: views.map((v, i) => (i === naming.index ? { ...v, name } : v)) })
    }
    setNaming(null)
  }

  return (
    <div className="w-56 rounded-lg border border-zinc-800 bg-[#121215]/90 p-2 text-xs text-zinc-300">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
        <Camera className="h-3.5 w-3.5 text-blue-400" />Góc nhìn ({views.length})
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {views.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <button className="flex-1 truncate rounded bg-zinc-800 px-2 py-0.5 text-left" onClick={() => setFlyTo({ position: v.position, target: v.target, level: v.level })}
                      onDoubleClick={() => setNaming({ index: i, name: v.name })}>{v.name}</button>
              <button aria-label={`Xoá ${v.name}`} onClick={() => update({ views: views.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3 w-3 text-zinc-500 hover:text-red-400" />
              </button>
            </div>
          ))}
          {naming ? (
            <form onSubmit={commit}>
              <input autoFocus aria-label="Tên góc nhìn" maxLength={60} value={naming.name} className="w-full rounded bg-zinc-800 px-1"
                     onChange={(e) => setNaming({ ...naming, name: e.target.value })} onBlur={commit} />
            </form>
          ) : (
            views.length < 20 && (
              <button disabled={!current} onClick={() => setNaming({ index: null, name: '' })}
                      className="w-full rounded bg-blue-600 px-2 py-0.5 text-white disabled:bg-zinc-700">Lưu góc nhìn</button>
            )
          )}
        </div>
      )}
    </div>
  )
}
