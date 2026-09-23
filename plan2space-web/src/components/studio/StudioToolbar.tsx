import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGeometryStore } from '../../stores/geometryStore'
import { runVectorization } from '../../services/aiJobService'
import {
  ArrowLeft,
  Save,
  AlertTriangle,
  RotateCcw,
  Layers,
  Box,
  CheckCircle2,
  Sliders,
  Sparkles,
  MousePointer,
  Square,
  DoorOpen,
  Upload
} from 'lucide-react'

const ACCEPTED_PLAN_TYPES = '.dxf,.png,.jpg,.jpeg,.pdf'

export function StudioToolbar({ projectId }: { projectId: string }) {
  const saveToServer = useGeometryStore((s) => s.saveToServer)
  const saveConflict = useGeometryStore((s) => s.saveConflict)
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)
  const version = useGeometryStore((s) => s.version)
  const walls = useGeometryStore((s) => s.walls)
  const openings = useGeometryStore((s) => s.openings)

  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [importProgress, setImportProgress] = useState<number | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Upload a plan → AI vectorization → the worker writes geometry server-side → reload it here.
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    setImportProgress(0)
    try {
      await runVectorization(projectId, file, (_status, pct) => setImportProgress(pct))
      await loadFromServer(projectId)
    } catch (err: any) {
      setImportError(err?.response?.data?.message || err?.message || 'AI import failed')
    } finally {
      setImportProgress(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    setJustSaved(false)
    try {
      await saveToServer(projectId)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <header className="h-12 border-b border-zinc-800 bg-[#121215] px-4 flex items-center justify-between select-none z-20 shrink-0">
      {/* Left: Navigation & Project Meta */}
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition py-1 px-2 rounded hover:bg-zinc-800/60"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Projects</span>
        </Link>

        <div className="h-4 w-px bg-zinc-800" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white tracking-tight">Plan2Space</span>
          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
            v{version}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 font-mono ml-2">
          <span>{walls.length} walls</span>
          <span>·</span>
          <span>{openings.length} openings</span>
        </div>
      </div>

      {/* Center: CAD Tool Mode Buttons */}
      <div className="hidden sm:flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
        <button
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 text-white font-medium shadow-sm"
          title="Select & Move (V)"
        >
          <MousePointer className="w-3.5 h-3.5" />
          <span>Select</span>
        </button>
        <button
          className="flex items-center gap-1 px-2.5 py-1 rounded text-zinc-400 hover:text-zinc-200 transition"
          title="Wall Tool (W)"
        >
          <Square className="w-3.5 h-3.5" />
          <span>Wall</span>
        </button>
        <button
          className="flex items-center gap-1 px-2.5 py-1 rounded text-zinc-400 hover:text-zinc-200 transition"
          title="Opening Tool (O)"
        >
          <DoorOpen className="w-3.5 h-3.5" />
          <span>Opening</span>
        </button>
      </div>

      {/* Right: Import, Save & Conflict Alert */}
      <div className="flex items-center gap-3">
        {importError && (
          <div role="alert" className="max-w-xs truncate text-xs text-red-400" title={importError}>
            {importError}
          </div>
        )}

        <label
          className={`flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium transition ${
            importProgress !== null ? 'cursor-wait opacity-60' : 'cursor-pointer text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{importProgress !== null ? `AI ${importProgress}%` : 'Import plan'}</span>
          <input
            type="file"
            accept={ACCEPTED_PLAN_TYPES}
            className="sr-only"
            aria-label="Import plan"
            disabled={importProgress !== null}
            onChange={handleImport}
          />
        </label>

        {saveConflict && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 px-3 py-1 rounded-lg">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Someone else changed this project.</span>
            <button
              className="underline font-medium hover:text-amber-300 ml-1 flex items-center gap-1"
              onClick={() => loadFromServer(projectId)}
            >
              <RotateCcw className="w-3 h-3" />
              Reload latest
            </button>
          </div>
        )}

        {justSaved && !saveConflict && (
          <div className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Saved</span>
          </div>
        )}

        <button
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white px-3.5 py-1.5 text-xs font-medium transition shadow-sm disabled:opacity-50"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>
      </div>
    </header>
  )
}
