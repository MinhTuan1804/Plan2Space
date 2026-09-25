import { useGeometryStore } from '../stores/geometryStore'
import { suggestFurniture } from '../services/stagingService'
import { Catalog } from '../services/catalogService'
import { roomTypeOf } from './roomTypes'

// Furnishes one room from its type's list; replaces only the furniture standing in that room.
export async function autoFurnishRoom(roomId: string, catalog: Catalog): Promise<string | null> {
  const { rooms, openings } = useGeometryStore.getState()
  const room = rooms.find((r) => r.id === roomId)
  if (!room) return 'That room no longer exists.'
  const type = roomTypeOf(room.label)
  if (!type) return 'Choose the room type first.'
  const items = (catalog.autoFurnish[type] ?? []).map((id) => catalog.byId[id]).filter(Boolean)
    .map((e) => ({ id: e.id, widthM: e.widthM, depthM: e.depthM, againstWall: e.againstWall }))
  // Nothing may be placed where a door swings.
  const keepClear = openings.filter((o) => o.type === 'Door')
    .map((o) => [o.position.x, o.position.y, o.widthMeters] as [number, number, number])
  let placed
  try {
    placed = await suggestFurniture(room.points, room.label, items, keepClear)
  } catch {
    return 'Auto-furnish is unavailable right now. Try again.'
  }
  useGeometryStore.getState().replaceFurnitureInRoom(room.points,
    placed.map((p) => ({ catalogId: p.item, x: p.position[0], y: p.position[1], rotationDeg: p.rotationDeg })))
  return placed.length === 0 ? 'Nothing fitted in this room.' : null
}
