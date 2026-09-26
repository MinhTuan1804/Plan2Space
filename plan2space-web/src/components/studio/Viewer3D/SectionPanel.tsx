import React, { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Scissors } from 'lucide-react'
import { useEditorStore } from '../../../stores/editorStore'
import { useGeometryStore } from '../../../stores/geometryStore'
import { NO_CUT, SectionBox, sectionPlanes } from '../../../lib/sectionBox'

const SLIDERS: { key: keyof SectionBox; label: string }[] = [
  { key: 'z', label: 'Chiều cao' },
  { key: 'x', label: 'Chiều ngang (x)' },
  { key: 'y', label: 'Chiều sâu (y)' },
]

// The section box's switch and sliders, over the 3D view.
export function SectionPanel() {
  const section = useEditorStore((s) => s.section)
  const setSection = useEditorStore((s) => s.setSection)
  return (
    <div className="absolute top-14 right-4 z-10 w-56 rounded-lg border border-zinc-800 bg-[#121215]/90 p-2 text-xs text-zinc-300">
      <button onClick={() => setSection(section ? null : NO_CUT)}
              className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 ${section ? 'bg-amber-600 text-white' : 'bg-zinc-800'}`}>
        <Scissors className="w-3.5 h-3.5" />Cắt lát
      </button>
      {section && SLIDERS.map(({ key, label }) => (
        <label key={key} className="mt-2 block">
          <span className="flex justify-between text-zinc-400">{label}<span>{Math.round(section[key] * 100)}%</span></span>
          <input type="range" min={0} max={100} value={Math.round(section[key] * 100)} className="w-full" aria-label={label}
                 onChange={(e) => setSection({ ...section, [key]: Number(e.target.value) / 100 })} />
        </label>
      ))}
    </div>
  )
}

// Inside the canvas: hands the section box's planes to the renderer, which clips every material with them.
export function SectionClipping() {
  const gl = useThree((s) => s.gl)
  const section = useEditorStore((s) => s.section)
  const walls = useGeometryStore((s) => s.walls)
  const planes = useMemo(() => (section ? sectionPlanes(walls, section) : []), [walls, section])
  useEffect(() => {
    gl.clippingPlanes = planes
    return () => { gl.clippingPlanes = [] }
  }, [gl, planes])
  return null
}
