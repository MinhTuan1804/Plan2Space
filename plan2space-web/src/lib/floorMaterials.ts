import { Room } from '../services/geometryService'
import { isLightWellName, roomTypeOf, RoomType } from './roomTypes'

// The PBR floors (public/materials/<id>): tileM is the real size one texture repeat covers.
// The server accepts exactly these ids (SaveGeometryCommand.FloorMaterials).
export const FLOOR_MATERIALS = [
  { id: 'wood_oak', name: 'Gỗ sồi', tileM: 2 },
  { id: 'wood_walnut', name: 'Gỗ óc chó', tileM: 2 },
  { id: 'wood_light', name: 'Gỗ sáng', tileM: 2 },
  { id: 'marble', name: 'Đá hoa', tileM: 1.5 },
  { id: 'ceramic_tile', name: 'Gạch men', tileM: 1 },
  { id: 'terrazzo', name: 'Terrazzo', tileM: 1.5 },
  { id: 'pebbles', name: 'Sỏi', tileM: 1 },
  { id: 'concrete', name: 'Bê tông', tileM: 2 },
] as const
export type FloorMaterialId = (typeof FLOOR_MATERIALS)[number]['id']

const BY_TYPE: Partial<Record<RoomType, FloorMaterialId>> = {
  bathroom: 'ceramic_tile', kitchen: 'terrazzo', courtyard: 'pebbles', garage: 'concrete', balcony: 'ceramic_tile',
}

export const defaultFloorMaterial = (type: RoomType | null): FloorMaterialId => (type && BY_TYPE[type]) || 'wood_oak'

const isKnown = (id: string | null | undefined): id is FloorMaterialId => FLOOR_MATERIALS.some((m) => m.id === id)

// The room's own choice, or (none, or one this version does not know) the default for its type.
export function floorMaterialOf(room: Room): FloorMaterialId {
  if (isKnown(room.floorMaterial)) return room.floorMaterial
  return isLightWellName(room.label) ? 'pebbles' : defaultFloorMaterial(roomTypeOf(room.label))
}
