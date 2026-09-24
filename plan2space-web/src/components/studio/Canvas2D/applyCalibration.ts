import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { setUnderlayScale } from '../../../services/underlayService'

// Scale, save, and only then correct the underlay: if the save fails the plan and its image never disagree
// on the server. Resolves to a message for the user, or null when everything was applied.
export async function applyCalibration(factor: number, underlayMpp: number | null): Promise<string | null> {
  const store = useGeometryStore.getState()
  const projectId = store.projectId
  if (!projectId) return 'No project is open.'
  store.scalePlan(factor)
  try {
    await useGeometryStore.getState().saveToServer(projectId)
  } catch (err: any) {
    return err?.response?.data?.message || 'The scaled plan could not be saved. Try again.'
  }
  if (useGeometryStore.getState().saveConflict) {
    return 'The plan changed elsewhere. Reload it, then set the scale again.'
  }
  if (underlayMpp !== null) {
    try {
      await setUnderlayScale(projectId, underlayMpp * factor)
      useEditorStore.getState().bumpUnderlay()
    } catch {
      return 'The plan was rescaled, but the background image could not be updated. Reload to realign it.'
    }
  }
  return null
}
