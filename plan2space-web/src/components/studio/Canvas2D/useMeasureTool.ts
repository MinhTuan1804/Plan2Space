import { useState } from 'react'
import { Point } from '../../../services/geometryService'

// Two clicks measure a line; dimension lines are not walls, so nothing snaps.
export function useMeasureTool() {
  const [start, setStart] = useState<Point | null>(null)
  const [end, setEnd] = useState<Point | null>(null)
  const [hover, setHover] = useState<Point | null>(null)

  return {
    preview: start ? [start, end ?? hover ?? start] : null,
    measuredM: start && end ? Math.hypot(end.x - start.x, end.y - start.y) : null,
    onPointerDown(p: Point) {
      if (!start || end) {
        setStart(p)
        setEnd(null)
        setHover(p)
      } else {
        setEnd(p)
      }
    },
    onPointerMove(p: Point) {
      if (start && !end) setHover(p)
    },
    reset() {
      setStart(null)
      setEnd(null)
      setHover(null)
    },
  }
}
