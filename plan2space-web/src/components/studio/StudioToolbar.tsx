import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useGeometryStore } from '../../stores/geometryStore'
import { runVectorization } from '../../services/aiJobService'
import { downloadExport, EXPORT_OPTIONS, ExportFormat } from '../../services/exportService'
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
  Upload,
  Download
} from 'lucide-react'

const ACCEPTED_PLAN_TYPES = '.dxf,.png,.jpg,.jpeg,.pdf'

export function StudioToolbar({ projectId }: { projectId: string }) {
  const saveToServer = useGeometryStore((s) => s.saveToServer)
  const saveConflict = useGeometryStore((s) => s.saveConflict)
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)
  const version = useGeometryStore((s) => s.version)
  const walls = useGeometryStore((s) => s.walls)
  const openings = useGeometryStore((s) => s.openings)
  const dirty = useGeometryStore((s) => s.dirty)
  const draftDiscarded = useGeometryStore((s) => s.draftDiscarded)

  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [importProgress, setImportProgress] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  async function handleExport(format: ExportFormat) {
    setExportOpen(false)
    setActionError(null)
    setExporting(format)
    try {
      // The export is built from the saved plan, so save unsaved edits first: export what the user sees.
      if (useGeometryStore.getState().dirty) {
        await saveToServer(projectId)
        if (useGeometryStore.getState().saveConflict) {
          setActionError('Save your changes (reload to resolve the conflict) before exporting.')
          return
        }
      }
      await downloadExport(projectId, format)
    } catch (err: any) {
      setActionError(err?.message || 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  // Upload a plan → AI vectorization → the worker writes geometry server-side → reload it here.
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const current = useGeometryStore.getState()
    if ((current.walls.length > 0 || current.dirty) &&
        !window.confirm('Importing replaces the whole current plan (walls, rooms, doors and windows). Continue?')) {
      return
    }
    setActionError(null)
    setImportProgress(0)
    try {
      await runVectorization(projectId, file, (_status, pct) => setImportProgress(pct))
      await loadFromServer(projectId)
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err?.message || 'AI import failed')
    } finally {
      setImportProgress(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    setJustSaved(false)
    setActionError(null)
    try {
      await saveToServer(projectId)
      if (!useGeometryStore.getState().saveConflict) {
        setJustSaved(true)
        setTimeout(() => setJustSaved(false), 2000)
      }
    } catch (err: any) {
      // e.g. 422 overlapping rooms / 400 invalid geometry: say why instead of failing silently.
      setActionError(err?.response?.data?.message || 'Save failed. Please try again.')
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
        {draftDiscarded && (
          <div role="status" className="max-w-xs truncate text-xs text-amber-400"
               title="Unsaved edits from an earlier session were discarded because the plan was changed since.">
            Earlier unsaved edits were discarded (plan changed since)
          </div>
        )}
        {dirty && !saveConflict && <span className="text-[11px] text-zinc-500">Unsaved changes</span>}

        {actionError && (
          <div role="alert" className="max-w-xs truncate text-xs text-red-400" title={actionError}>
            {actionError}
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

        <div className="relative">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
            onClick={() => setExportOpen((o) => !o)}
            disabled={exporting !== null}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}</span>
          </button>
          {exportOpen && (
            <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-zinc-800 bg-[#121215] p-1 shadow-xl">
              {EXPORT_OPTIONS.map((o) => (
                <button
                  key={o.format}
                  role="menuitem"
                  className="block w-full rounded px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                  onClick={() => handleExport(o.format)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

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
