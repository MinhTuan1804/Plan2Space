import { useEffect, useState } from 'react'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { fetchFileObjectUrl, fetchUnderlay, Underlay } from '../../../services/underlayService'

// The latest import's image, if it has one. Re-checked when the plan version changes (a new import);
// the image itself is downloaded again only when it is a different file.
export function useUnderlay(): { underlay: Underlay; image: HTMLImageElement } | null {
  const projectId = useGeometryStore((s) => s.projectId)
  const version = useGeometryStore((s) => s.version)
  const revision = useEditorStore((s) => s.underlayRevision)
  const [underlay, setUnderlay] = useState<Underlay | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    fetchUnderlay(projectId)
      .then((u) => { if (!cancelled) { setUnderlay(u); useEditorStore.getState().setUnderlayMeta(u) } })
      .catch(() => { if (!cancelled) { setUnderlay(null); useEditorStore.getState().setUnderlayMeta(null) } })   // no underlay is never an error
    return () => { cancelled = true }
  }, [projectId, version, revision])

  const fileId = underlay?.fileId
  useEffect(() => {
    setImage(null)
    if (!projectId || !fileId) return
    let cancelled = false
    let url: string | null = null
    fetchFileObjectUrl(projectId, fileId)
      .then((objectUrl) => {
        url = objectUrl
        if (cancelled) return
        const img = new window.Image()
        img.onload = () => { if (!cancelled) setImage(img) }
        img.src = objectUrl
      })
      .catch(() => { if (!cancelled) setImage(null) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [projectId, fileId])

  return underlay && image ? { underlay, image } : null
}
