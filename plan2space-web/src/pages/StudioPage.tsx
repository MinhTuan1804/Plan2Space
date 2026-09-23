import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useGeometryStore } from '../stores/geometryStore'
import {
  ArrowLeft,
  Save,
  Layers,
  Box,
  SlidersHorizontal,
  Compass,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Download
} from 'lucide-react'

export default function StudioPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { loadFromServer, saveToServer, version, walls, rooms, openings } = useGeometryStore()
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [activeTab, setActiveTab] = useState<'split' | '2d' | '3d'>('split')

  useEffect(() => {
    if (projectId) {
      loadFromServer(projectId).catch(() => {})
    }
  }, [projectId, loadFromServer])

  async function handleSave() {
    if (!projectId) return
    setSaving(true)
    setSaveStatus('idle')
    try {
      await saveToServer(projectId)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2500)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden select-none">
      {/* Top Studio Control Bar */}
      <header className="h-12 border-b border-zinc-800/90 bg-[#121215] px-4 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition py-1 px-2 rounded hover:bg-zinc-800/80"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>

          <div className="h-4 w-px bg-zinc-800" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white tracking-tight">Studio</span>
            <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">
              v{version}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <span>{walls.length} walls</span>
            <span>·</span>
            <span>{openings.length} openings</span>
          </div>
        </div>

        {/* Center: View Switcher */}
        <div className="flex items-center rounded-lg bg-zinc-900/90 p-0.5 border border-zinc-800 text-xs">
          <button
            onClick={() => setActiveTab('split')}
            className={`px-3 py-1 rounded-md transition font-medium ${
              activeTab === 'split' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Split View
          </button>
          <button
            onClick={() => setActiveTab('2d')}
            className={`px-3 py-1 rounded-md transition font-medium ${
              activeTab === '2d' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            2D CAD
          </button>
          <button
            onClick={() => setActiveTab('3d')}
            className={`px-3 py-1 rounded-md transition font-medium ${
              activeTab === '3d' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            3D Space
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium mr-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-[11px] text-red-400 font-medium mr-2">
              <AlertCircle className="w-3.5 h-3.5" /> Conflict / Error
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.99] text-white px-3.5 py-1.5 text-xs font-medium transition shadow-sm disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </header>

      {/* Main Studio Viewport (2D + 3D Slots) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 2D Canvas Slot */}
        <div
          id="canvas-2d-slot"
          className={`flex-1 border-r border-zinc-800/80 relative bg-[#0d0d10] ${
            activeTab === '3d' ? 'hidden' : 'block'
          }`}
        >
          {/* Slot content is mounted here by CanvasEditor */}
        </div>

        {/* 3D Viewer Slot */}
        <div
          id="viewer-3d-slot"
          className={`flex-1 relative bg-[#09090b] ${
            activeTab === '2d' ? 'hidden' : 'block'
          }`}
        >
          {/* Slot content is mounted here by Viewer3D */}
        </div>
      </div>
    </div>
  )
}
