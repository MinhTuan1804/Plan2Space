import { apiClient } from './api'
import { Point } from './geometryService'

export async function suggestFurniture(
  roomPolygon: Point[], roomLabel: string,
  items: { id: string; widthM: number; depthM: number; againstWall: boolean }[],
  keepClear: [number, number, number][],
): Promise<{ item: string; position: [number, number]; rotationDeg: number }[]> {
  const { data } = await apiClient.post('/staging/suggest', {
    roomPolygon: roomPolygon.map((p) => [p.x, p.y]), roomLabel, items, keepClear,
  })
  return data.items
}
