import React, { useState } from 'react'
import { useGeometryStore } from '../../stores/geometryStore'
import { planMerge } from '../../lib/levels'

const MIN_H = 2.2
const MAX_H = 6.0

// Stacks the two side-by-side floors of a plan into one two-storey house.
export function MergeFloorsDialog({ onClose }: { onClose: () => void }) {
  const walls = useGeometryStore((s) => s.walls)
  const merge = planMerge(walls)
  const [swap, setSwap] = useState(false)
  const [heights, setHeights] = useState(['3.6', '3.6'])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!merge) return null
  const values = heights.map(Number) as [number, number]
  const valid = values.every((h) => h >= MIN_H && h <= MAX_H)
  const [first, second] = swap ? ['phải', 'trái'] : ['trái', 'phải']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-80 rounded-lg border border-zinc-800 bg-[#121215] p-4 text-sm text-zinc-200">
        <div className="mb-2 font-medium">Ghép tầng</div>
        <div>Tầng 1: khối {first}</div>
        <div className="mb-2">Tầng 2: khối {second} (đặt chồng lên tầng 1)</div>
        <button className="mb-3 rounded border border-zinc-700 px-2 py-0.5" onClick={() => setSwap(!swap)}>Đảo</button>
        {merge.sizeMismatch && (
          <div role="alert" className="mb-2 text-amber-400">Hai khối này có vẻ không phải các tầng của cùng một nhà.</div>
        )}
        {merge.otherBlocks > 0 && (
          <div role="alert" className="mb-2 text-amber-400">
            Bản vẽ còn {merge.otherBlocks} khối khác sẽ giữ nguyên ở tầng 1 (chỉ ghép 2 khối lớn nhất).
          </div>
        )}
        {['Chiều cao tầng 1 (m)', 'Chiều cao tầng 2 (m)'].map((label, i) => (
          <label key={i} className="mb-2 flex items-center justify-between">
            <span>{label}</span>
            <input type="number" step={0.1} min={MIN_H} max={MAX_H} value={heights[i]}
                   onChange={(e) => setHeights(heights.map((h, j) => (j === i ? e.target.value : h)))}
                   className="w-20 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1" />
          </label>
        ))}
        {message && <div role="alert" className="mb-2 text-red-400">{message}</div>}
        <div className="flex justify-end gap-2">
          <button className="rounded px-2 py-1 text-zinc-400" onClick={onClose}>Huỷ</button>
          <button disabled={!valid || busy} className="rounded bg-blue-600 px-3 py-1 text-white disabled:bg-zinc-700"
                  onClick={async () => {
                    setBusy(true)
                    const error = await useGeometryStore.getState().mergeLevels(values, swap)
                    setBusy(false)
                    if (error) setMessage(error); else onClose()
                  }}>Ghép</button>
        </div>
      </div>
    </div>
  )
}
