import React, { useState } from 'react'
import { calibrationFactor, MIN_MEASURE_M } from '../../../lib/planGeometry'

export function CalibrationDialog({ measuredM, onApply, onCancel }: {
  measuredM: number
  onApply: (realM: number) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function apply() {
    const realM = Number(text.replace(',', '.'))
    if (measuredM < MIN_MEASURE_M) {
      setError(`That line is too short to calibrate from (under ${MIN_MEASURE_M * 100} cm). Measure a longer one.`)
      return
    }
    if (text.trim() === '' || calibrationFactor(measuredM, realM) === null) {
      setError('Enter the real length as a positive number of metres, e.g. 7.')
      return
    }
    onApply(realM)
  }

  return (
    <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-lg border border-zinc-800 bg-[#121215] p-3 text-xs text-zinc-200 shadow-lg">
      <div className="mb-2">Measured {measuredM.toFixed(2)} m on the plan. What is its real length?</div>
      <div className="flex items-center gap-2">
        <input
          aria-label="Real length in metres"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') onCancel() }}
          className="w-24 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1"
          placeholder="7"
        />
        <span>m</span>
        <button onClick={apply} className="rounded bg-blue-600 px-2 py-1 text-white">Apply</button>
        <button onClick={onCancel} className="rounded px-2 py-1 text-zinc-400 hover:text-white">Cancel</button>
      </div>
      {error && <div role="alert" className="mt-2 text-amber-400">{error}</div>}
    </div>
  )
}
