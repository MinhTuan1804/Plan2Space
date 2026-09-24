import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGeometryStore } from '../stores/geometryStore'
import { CanvasEditor } from '../components/studio/Canvas2D/CanvasEditor'
import { Scene } from '../components/studio/Viewer3D/Scene'
import { StudioToolbar } from '../components/studio/StudioToolbar'
import { CopilotChat } from '../components/studio/Copilot/CopilotChat'
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning'
import { useEditorShortcuts } from '../hooks/useEditorShortcuts'
import { WalkMode } from '../components/studio/Walk/WalkMode'
import { useEditorStore } from '../stores/editorStore'

export default function StudioPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)
  const dirty = useGeometryStore((s) => s.dirty)
  useUnsavedChangesWarning(dirty)
  useEditorShortcuts()
  const walking = useEditorStore((s) => s.walking)
  // Leaving the studio closes the walk-through, so it does not reopen on the next project.
  useEffect(() => () => useEditorStore.getState().setWalking(false), [])

  useEffect(() => {
    if (projectId) {
      loadFromServer(projectId).catch(() => {})
    }
  }, [projectId, loadFromServer])

  if (!projectId) return null

  return (
    <div className="flex h-screen flex-col bg-[#09090b] text-white overflow-hidden select-none">
      <StudioToolbar projectId={projectId} />
      <div className="flex flex-1 overflow-hidden relative">
        <div id="canvas-2d-slot" className="flex-1 border-r border-zinc-800/80 relative bg-[#0d0d10]">
          <CanvasEditor />
        </div>
        <div id="viewer-3d-slot" className="flex-1 relative bg-[#09090b]">
          <Scene />
        </div>
        <CopilotChat projectId={projectId} />
      </div>
      {walking && <WalkMode />}
    </div>
  )
}
