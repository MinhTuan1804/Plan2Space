import React from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '../../../stores/editorStore'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useCatalog } from '../../../services/catalogService'
import { polygonArea } from '../../../lib/planGeometry'
import { formatArea } from '../../../lib/measure'
import { lightOn } from '../../../lib/interaction'
import { useSun } from './SunStudyPanel'

const STYLE_NAME = { standard: 'cửa thường', garage: 'cửa garage' } as const

// What was clicked in 3D: a piece of furniture, a door or window, or a room.
export function InfoCard() {
  const picked = useEditorStore((s) => s.picked)
  const setPicked = useEditorStore((s) => s.setPicked)
  const { furniture, openings, rooms } = useGeometryStore()
  const catalog = useCatalog()
  const { openDoors, toggleDoor, lightsOverride, toggleLight } = useEditorStore()
  const night = !useSun().up
  if (!picked) return null
  let title = '', lines: string[] = []
  let action: { label: string; run: () => void } | null = null
  if (picked.kind === 'furniture') {
    const f = furniture.find((x) => x.id === picked.id)
    const e = f && catalog?.byId[f.catalogId]
    if (!f) return null
    title = e?.name ?? f.catalogId
    if (e) lines = [`${e.widthM.toFixed(2)} × ${e.depthM.toFixed(2)} × ${e.heightM.toFixed(2)} m`]
  } else if (picked.kind === 'opening') {
    const o = openings.find((x) => x.id === picked.id)
    if (!o) return null
    title = o.type === 'Door' ? 'Cửa đi' : 'Cửa sổ'
    lines = [`Rộng ${o.widthMeters.toFixed(2)} m`]
    if (o.type === 'Door') {
      lines.push(o.doorStyle ? STYLE_NAME[o.doorStyle] : 'kiểu tự động')
      action = { label: openDoors.has(o.id) ? 'Đóng cửa' : 'Mở cửa', run: () => toggleDoor(o.id) }
    }
  } else {
    const r = rooms.find((x) => x.id === picked.id)
    if (!r) return null
    title = r.label
    lines = [`${formatArea(Math.abs(polygonArea(r.points)))} · Tầng ${(r.level ?? 0) + 1}`]
    const on = lightOn(r.id, lightsOverride, night)
    action = { label: on ? 'Tắt đèn' : 'Bật đèn', run: () => toggleLight(r.id, on) }
  }
  return (
    <div className="absolute bottom-4 left-1/2 z-10 w-60 -translate-x-1/2 rounded-lg border border-zinc-800 bg-[#121215]/95 p-3 text-xs text-zinc-200">
      <button aria-label="Đóng" onClick={() => setPicked(null)} className="absolute right-2 top-2 text-zinc-500 hover:text-white">
        <X className="h-3 w-3" />
      </button>
      <div className="mb-1 font-semibold">{title}</div>
      {lines.map((l) => <div key={l} className="text-zinc-400">{l}</div>)}
      {action && (
        <button onClick={action.run} className="mt-2 w-full rounded bg-amber-600 px-2 py-1 text-white">{action.label}</button>
      )}
    </div>
  )
}
