import React, { useEffect, useMemo, useState } from 'react'
import { Sun, Play, Pause } from 'lucide-react'
import { useEditorStore } from '../../../stores/editorStore'
import { useViewSettingsStore } from '../../../stores/viewSettingsStore'
import { CITIES, sunDirection, sunPosition, sunTime } from '../../../lib/sunPosition'

const FIRST_HOUR = 5
const LAST_HOUR = 19
const STEP_H = 0.25
const PLAY_TICK_MS = 180          // 56 steps from 5:00 to 19:00: about 10 s
const CUSTOM = 'Tuỳ chỉnh'

// The sun where and when the house is: from the saved location and north, and today's chosen day and hour.
export function useSun() {
  const { location, northDeg } = useViewSettingsStore((s) => s.settings)
  const date = useEditorStore((s) => s.sunDate)
  const hour = useEditorStore((s) => s.sunHour)
  return useMemo(() => {
    const { altitudeDeg, azimuthDeg } = sunPosition(sunTime(date, hour), location.lat, location.lon)
    return { altitudeDeg, azimuthDeg, direction: sunDirection(altitudeDeg, azimuthDeg, northDeg), up: altitudeDeg > 0 }
  }, [location.lat, location.lon, northDeg, date, hour])
}

const clock = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

export function SunStudyPanel() {
  const { settings, update, saveError } = useViewSettingsStore()
  const { sunDate, sunHour, setSun } = useEditorStore()
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const city = CITIES.find((c) => c.lat === settings.location.lat && c.lon === settings.location.lon)?.name ?? CUSTOM

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const { sunDate: d, sunHour: h } = useEditorStore.getState()
      if (h + STEP_H > LAST_HOUR) { setPlaying(false); return }
      setSun(d, h + STEP_H)
    }, PLAY_TICK_MS)
    return () => clearInterval(id)
  }, [playing, setSun])

  const play = () => {
    if (!playing && sunHour >= LAST_HOUR) setSun(sunDate, FIRST_HOUR)
    setPlaying(!playing)
  }

  return (
    <div className="absolute top-4 left-4 z-10 w-60 rounded-lg border border-zinc-800 bg-[#121215]/90 p-2 text-xs text-zinc-300">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
        <Sun className="h-3.5 w-3.5 text-amber-400" />Nắng · {clock(sunHour)}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <label className="flex items-center justify-between gap-2">Vị trí
            <select aria-label="Vị trí" value={city} className="rounded bg-zinc-800 px-1"
                    onChange={(e) => {
                      const c = CITIES.find((x) => x.name === e.target.value)
                      if (c) update({ location: { lat: c.lat, lon: c.lon } })
                    }}>
              {CITIES.map((c) => <option key={c.name}>{c.name}</option>)}
              <option>{CUSTOM}</option>
            </select>
          </label>
          {city === CUSTOM && (
            <div className="flex gap-1">
              {(['lat', 'lon'] as const).map((k) => (
                <input key={k} type="number" step="0.001" aria-label={k === 'lat' ? 'Vĩ độ' : 'Kinh độ'} value={settings.location[k]}
                       min={k === 'lat' ? -90 : -180} max={k === 'lat' ? 90 : 180} className="w-1/2 rounded bg-zinc-800 px-1"
                       onChange={(e) => Number.isFinite(e.target.valueAsNumber)
                         && update({ location: { ...settings.location, [k]: e.target.valueAsNumber } })} />
              ))}
            </div>
          )}
          <label className="flex items-center justify-between gap-2">Hướng Bắc
            <span className="flex items-center gap-1">
              <span style={{ transform: `rotate(${settings.northDeg}deg)` }} className="inline-block text-amber-400">↑</span>
              <input type="number" min={0} max={359} aria-label="Hướng Bắc" value={settings.northDeg} className="w-14 rounded bg-zinc-800 px-1"
                     onChange={(e) => {
                       const v = e.target.valueAsNumber
                       if (Number.isFinite(v)) update({ northDeg: ((v % 360) + 360) % 360 })
                     }} />°
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">Ngày
            <input type="date" value={sunDate} className="rounded bg-zinc-800 px-1"
                   onChange={(e) => e.target.value && setSun(e.target.value, sunHour)} />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={play} aria-label={playing ? 'Dừng' : 'Chạy'} className="rounded bg-zinc-800 p-1">
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <input type="range" min={FIRST_HOUR} max={LAST_HOUR} step={STEP_H} value={sunHour} aria-label="Giờ" className="flex-1"
                   onChange={(e) => setSun(sunDate, Number(e.target.value))} />
          </div>
          {saveError && <div className="text-red-400">{saveError}</div>}
        </div>
      )}
    </div>
  )
}
