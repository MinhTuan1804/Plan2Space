import { useEffect } from 'react'
import { Tool, useEditorStore } from '../stores/editorStore'
import { useGeometryStore } from '../stores/geometryStore'

const TOOL_KEYS: Record<string, Tool> = { v: 'select', w: 'wall', o: 'opening', m: 'measure' }

// Keys typed into the co-pilot chat or a number field belong to that field, not to the editor.
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function useEditorShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        useEditorStore.getState().setTool('select')
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selection, select } = useEditorStore.getState()
        if (!selection) return
        e.preventDefault()
        if (selection.kind === 'wall') useGeometryStore.getState().deleteWall(selection.id)
        else useGeometryStore.getState().deleteOpening(selection.id)
        select(null)
        return
      }
      const tool = TOOL_KEYS[e.key.toLowerCase()]
      if (tool) useEditorStore.getState().setTool(tool)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
