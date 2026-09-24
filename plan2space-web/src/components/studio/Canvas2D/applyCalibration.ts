import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { setUnderlayScale } from '../../../services/underlayService'

// A double-click on Apply or a held Enter must not scale the plan twice.
let inFlight = false

// Scale, save, and only then correct the underlay. If the save fails or conflicts the plan is put back as it
// was, so the plan and its image never disagree. Resolves to a message for the user, or null when done.
export async function applyCalibration(factor: number, underlayMpp: number | null): Promise<string | null> {
  if (inFlight) return 'A calibration is already being applied.'
  const projectId = useGeometryStore.getState().projectId
  if (!projectId) return 'No project is open.'
  inFlight = true
  try {
    const before = useGeometryStore.getState().snapshotPlan()
    useGeometryStore.getState().scalePlan(factor)
    try {
      await useGeometryStore.getState().saveToServer(projectId)
    } catch (err: any) {
      useGeometryStore.getState().restorePlan(before)
      return err?.response?.data?.message || 'The scaled plan could not be saved, so nothing was changed. Try again.'
    }
    if (useGeometryStore.getState().saveConflict) {
      useGeometryStore.getState().restorePlan(before)
      return 'The plan changed elsewhere, so nothing was changed. Reload it, then set the scale again.'
    }
    if (underlayMpp !== null) {
      useEditorStore.getState().setPendingUnderlayMpp(underlayMpp * factor)
      return await retryUnderlayScale()
    }
    return null
  } finally {
    inFlight = false
  }
}

// Sends a saved calibration's image scale; kept pending on failure so the user can retry it.
export async function retryUnderlayScale(): Promise<string | null> {
  const mpp = useEditorStore.getState().pendingUnderlayMpp
  const projectId = useGeometryStore.getState().projectId
  if (mpp === null || !projectId) return null
  try {
    await setUnderlayScale(projectId, mpp)
  } catch {
    return 'The plan was rescaled, but the background image could not be realigned yet. Use Retry to try again.'
  }
  useEditorStore.getState().setPendingUnderlayMpp(null)
  useEditorStore.getState().bumpUnderlay()
  return null
}
