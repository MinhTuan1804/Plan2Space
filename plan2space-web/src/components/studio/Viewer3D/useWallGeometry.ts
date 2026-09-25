import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Wall, Opening } from '../../../services/geometryService'
import { buildWallGeometry } from './buildWallGeometry'
import { cutOpeningsIntoWall } from './cutOpenings'

// Rebuilds (and re-runs CSG for) a wall only when that wall or its own openings change,
// and frees the previous GPU buffers — keeps edits to one wall from re-cutting every wall.
export function useWallGeometry(wall: Wall, openings: Opening[], extend: [number, number] = [0, 0]): THREE.BufferGeometry {
  const ownOpenings = openings.filter((o) => o.wallId === wall.id)
  const openingsKey = JSON.stringify(
    ownOpenings.map((o) => [o.id, o.type, o.position.x, o.position.y, o.widthMeters, o.sillHeightMeters])
  )

  const geometry = useMemo(() => {
    const solid = buildWallGeometry(wall, extend)
    const cut = cutOpeningsIntoWall(solid, wall, ownOpenings)
    if (cut !== solid) solid.dispose()
    return cut
    // ownOpenings is captured through openingsKey, so an unrelated wall's opening doesn't trigger a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wall, openingsKey, extend[0], extend[1]])

  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}
