import { Point } from '../../../services/geometryService'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { newId, placeOpening, WINDOW_SILL_HEIGHT_M } from '../../../lib/planGeometry'
import { levelOf } from '../../../lib/levels'

export function useOpeningTool() {
  const addOpening = useGeometryStore((s) => s.addOpening)
  return {
    onPointerDown(p: Point) {
      const { openingType, openingWidthM } = useEditorStore.getState()
      const placed = placeOpening(p, useGeometryStore.getState().walls.filter((w) => levelOf(w) === useEditorStore.getState().level), openingWidthM)
      if (!placed) return
      addOpening({
        id: newId(), wallId: placed.wallId, type: openingType, position: placed.position, widthMeters: openingWidthM,
        sillHeightMeters: openingType === 'Window' ? WINDOW_SILL_HEIGHT_M : 0, version: 0, level: useEditorStore.getState().level,
      })
    },
  }
}
