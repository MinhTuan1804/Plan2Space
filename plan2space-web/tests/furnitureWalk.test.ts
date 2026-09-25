import { describe, it, expect } from 'vitest'
import { freeSpot, furnitureBlockers, furnitureFootprints, spawnPoint, stepPlayer, wallBlockers, PLAYER_RADIUS_M } from '../src/lib/walkPhysics'
import { pointInPolygon } from '../src/lib/planGeometry'
import { floorPatches } from '../src/components/studio/Viewer3D/floorPlan'

const sizes: Record<string, { widthM: number; depthM: number; elevationM: number }> = {
  bed_double: { widthM: 1.6, depthM: 2.0, elevationM: 0 },
  tv: { widthM: 1.4, depthM: 0.1, elevationM: 0.9 },
  sofa_set: { widthM: 3.6, depthM: 2.7, elevationM: 0 },
}
const sizeOf = (id: string) => sizes[id]

describe('furniture in the walk', () => {
  it("a bed blocks the player; walking into its side stops at arm's length", () => {
    const blockers = furnitureBlockers([{ id: 'b', catalogId: 'bed_double', x: 0, y: 0, rotationDeg: 0 }], sizeOf)
    let p = { x: 3, y: 0 }
    for (let i = 0; i < 60; i++) p = stepPlayer(p, { x: -0.07, y: 0 }, blockers)
    expect(p.x).toBeGreaterThanOrEqual(0.8 + PLAYER_RADIUS_M - 1e-6)
  })

  it('wall-mounted items and unknown catalog ids do not block', () => {
    expect(furnitureBlockers([{ id: 't', catalogId: 'tv', x: 0, y: 0, rotationDeg: 0 }], sizeOf)).toHaveLength(0)
    expect(furnitureBlockers([{ id: 'u', catalogId: 'gone', x: 0, y: 0, rotationDeg: 0 }], sizeOf)).toHaveLength(0)
  })

  it('a rotated item blocks along its rotated footprint', () => {
    const blockers = furnitureBlockers([{ id: 'b', catalogId: 'bed_double', x: 0, y: 0, rotationDeg: 90 }], sizeOf)
    let p = { x: 3, y: 0 }
    for (let i = 0; i < 60; i++) p = stepPlayer(p, { x: -0.07, y: 0 }, blockers)
    expect(p.x).toBeGreaterThanOrEqual(1.0 + PLAYER_RADIUS_M - 1e-6)   // depth 2.0 now lies along x
  })

  it('a start covered by furniture moves to a free spot in the room, and the player can walk from there', () => {
    // Auto-furnish puts a 5×4 m living room's sofa set over the room centre.
    const room = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }]
    const walls = room.map((a, i) => ({ id: `w${i}`, points: [a, room[(i + 1) % 4]], thicknessMeters: 0.2, heightMeters: 3, version: 1 }))
    const furniture = [{ id: 's', catalogId: 'sofa_set', x: 3.1, y: 2.53, rotationDeg: 0 }]
    const footprints = furnitureFootprints(furniture, sizeOf)
    const blockers = [...wallBlockers(walls, []), ...furnitureBlockers(furniture, sizeOf)]
    const start = spawnPoint([{ id: 'r', label: 'Phòng khách', version: 1, points: room }], walls)
    expect(pointInPolygon(start, footprints[0])).toBe(true)

    const spot = freeSpot(start, blockers, footprints, room)
    expect(pointInPolygon(spot, footprints[0])).toBe(false)
    expect(pointInPolygon(spot, room)).toBe(true)
    const moved = stepPlayer(spot, { x: 0, y: -0.05 }, blockers)
    expect(Math.hypot(moved.x - spot.x, moved.y - spot.y)).toBeGreaterThan(0.01)
  })

  it('a free start stays where it is', () => {
    const blockers = furnitureBlockers([{ id: 'b', catalogId: 'bed_double', x: 0, y: 0, rotationDeg: 0 }], sizeOf)
    const footprints = furnitureFootprints([{ id: 'b', catalogId: 'bed_double', x: 0, y: 0, rotationDeg: 0 }], sizeOf)
    expect(freeSpot({ x: 3, y: 3 }, blockers, footprints)).toEqual({ x: 3, y: 3 })
  })
})

describe('floors by room type', () => {
  it('a kitchen is tiled however big it is; an untyped big room is wood', () => {
    const sq = (s: number) => [{ x: 0, y: 0 }, { x: s, y: 0 }, { x: s, y: s }, { x: 0, y: s }, { x: 0, y: 0 }]
    const [kitchen, other] = floorPatches([{ id: 'k', label: 'Bếp', version: 1, points: sq(4) },
                                           { id: 'o', label: 'Room 2', version: 1, points: sq(4) }], [])
    expect(kitchen.kind).toBe('tile')
    expect(other.kind).toBe('wood')
  })
})
