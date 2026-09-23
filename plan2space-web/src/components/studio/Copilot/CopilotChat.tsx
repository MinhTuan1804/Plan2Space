import React, { useState } from 'react'
import { Sparkles, Send } from 'lucide-react'
import { apiClient } from '../../../services/api'
import { useGeometryStore } from '../../../stores/geometryStore'

interface ChatLine {
  from: 'you' | 'copilot'
  text: string
  failed?: boolean
}

// Edits go through POST /api/copilot/message, which saves via the same concurrency-safe path as manual edits;
// when one was applied the plan is reloaded from the server.
export function CopilotChat({ projectId }: { projectId: string }) {
  const [message, setMessage] = useState('')
  const [log, setLog] = useState<ChatLine[]>([])
  const [busy, setBusy] = useState(false)
  const loadFromServer = useGeometryStore((s) => s.loadFromServer)

  async function send() {
    const text = message.trim()
    if (!text || busy) return
    setMessage('')
    setBusy(true)
    setLog((l) => [...l, { from: 'you', text }])
    try {
      // The co-pilot edits the saved plan: save local edits first, then send the version the user sees
      // so a newer plan from another tab is a conflict instead of being edited blindly.
      if (useGeometryStore.getState().dirty) {
        await useGeometryStore.getState().saveToServer(projectId)
        if (useGeometryStore.getState().saveConflict) {
          setLog((l) => [...l, { from: 'copilot', text: 'Your plan has conflicting changes — reload it before asking the co-pilot.', failed: true }])
          return
        }
      }
      const baseVersion = useGeometryStore.getState().version
      const { data } = await apiClient.post('/copilot/message', { projectId, message: text, baseVersion })
      setLog((l) => [...l, { from: 'copilot', text: data.message || data.action }])
      if (data.appliedVersion) await loadFromServer(projectId)
    } catch (err: any) {
      const reason = err?.response?.data?.message || 'The co-pilot could not complete that request.'
      setLog((l) => [...l, { from: 'copilot', text: reason, failed: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-zinc-800 bg-[#121215] text-zinc-100">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs font-semibold">
        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
        Co-pilot
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
        {log.length === 0 && (
          <p className="text-zinc-500">Try "move the bottom wall 50cm down", "add a window to the kitchen wall" or "make the bedroom 20% bigger".</p>
        )}
        {log.map((line, i) => (
          <p
            key={i}
            className={
              line.from === 'you'
                ? 'ml-6 rounded-lg bg-blue-600/20 px-2.5 py-1.5 text-blue-100'
                : `mr-6 rounded-lg px-2.5 py-1.5 ${line.failed ? 'bg-red-950/40 text-red-300' : 'bg-zinc-800/70 text-zinc-200'}`
            }
          >
            {line.text}
          </p>
        ))}
        {busy && <p className="text-zinc-500">Thinking…</p>}
      </div>
      <div className="flex items-center gap-2 border-t border-zinc-800 p-2">
        <input
          className="flex-1 rounded-md bg-zinc-900 px-2.5 py-2 text-xs placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Tell the co-pilot what to change..."
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !message.trim()} className="rounded-md p-2 text-blue-400 hover:bg-zinc-800 disabled:opacity-40" title="Send">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}
