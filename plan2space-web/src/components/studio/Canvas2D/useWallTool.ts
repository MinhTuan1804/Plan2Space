import { useState } from 'react'
import { Point, Wall } from '../../../services/geometryService'
import { useGeometryStore } from '../../../stores/geometryStore'
import { nearestOnWalls, wallFromDrag } from '../../../lib/planGeometry'
import { snapPoint } from './SnapEngine'

// Loose enough for a mouse: a wall drawn near another wall's end joins it, so rooms can close.
export const WALL_SNAP_M = 0.2

// A wall end first; otherwise the nearest point on a wall's body, so a partition drawn up to the middle of
// a wall meets it exactly. A few centimetres short would leave a gap and the rooms either side never close.
export function snapToWalls(p: Point, walls: Wall[], excludeWallId: string): Point {
  const toEnd = snapPoint(p, walls, excludeWallId, { endpointToleranceM: WALL_SNAP_M })
  if (toEnd !== p) return toEnd
  const hit = nearestOnWalls(p, walls.filter((w) => w.id !== excludeWallId))
  return hit && hit.distance <= WALL_SNAP_M ? hit.point : p
}

export function useWallTool() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const addWall = useGeometryStore((s) => s.addWall)

  const snap = (p: Point) => snapToWalls(p, useGeometryStore.getState().walls, '')
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
