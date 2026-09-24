import { useState } from 'react'
import { Point } from '../../../services/geometryService'
import { useGeometryStore } from '../../../stores/geometryStore'
import { wallFromDrag } from '../../../lib/planGeometry'
import { snapPoint } from './SnapEngine'

// Loose enough for a mouse: a wall drawn near another wall's end joins it, so rooms can close.
export const WALL_SNAP_M = 0.2

export function useWallTool() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const addWall = useGeometryStore((s) => s.addWall)

  const snap = (p: Point) => snapPoint(p, useGeometryStore.getState().walls, '', { endpointToleranceM: WALL_SNAP_M })
  const cancel = () => { setStart(null); setEnd(null) }

  return {
    preview: start && end ? [start, end] : null,
    onPointerDown(p: Point) {
      const s = snap(p)
      setStart(s)
      setEnd(s)
    },
    onPointerMove(p: Point) {
      if (start) setEnd(snap(p))
    },
    onPointerUp(p: Point) {
      if (!start) return
      const points = wallFromDrag(start, snap(p))
      if (points) addWall(points)
      cancel()
    },
    cancel,
  }
}
