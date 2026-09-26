import * as THREE from 'three'
import { Point, Room, Wall } from '../../../services/geometryService'
import { pointInPolygon } from '../../../lib/planGeometry'

// How far beyond a wall face the room behind it is looked up (the room polygons follow wall centrelines).
const PROBE_BEYOND_FACE_M = 0.3
// A face counts as one of the wall's long sides only if it faces across the wall, not along it (door jambs).
const ACROSS_MIN = 0.9

function nearestDirection(wall: Wall, p: Point): Point {
  let best = { distance: Infinity, u: { x: 1, y: 0 } }
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i]
    const b = wall.points[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) continue
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    const distance = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    const length = Math.sqrt(lengthSq)
    if (distance < best.distance) best = { distance, u: { x: dx / length, y: dy / length } }
  }
  return best.u
}

// Regroups a wall mesh so each long face is drawn with the paint of the room it faces. Material slot 0 is the
// default paint (outside faces, ends, top, jambs); slot i + 1 belongs to roomIds[i]. Depends only on the
// walls and rooms, so changing a colour swaps materials without rebuilding the geometry.
export function splitWallFacesByRoom(source: THREE.BufferGeometry, wall: Wall, rooms: Room[]):
    { geometry: THREE.BufferGeometry; roomIds: string[] } {
  const g = source.index ? source.toNonIndexed() : source.clone()
  g.clearGroups()
  const pos = g.getAttribute('position')
  const triangles = pos.count / 3
  const roomIds: string[] = []
  const slotOf = new Int32Array(triangles)
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3()
  for (let t = 0; t < triangles; t++) {
    a.fromBufferAttribute(pos, 3 * t); b.fromBufferAttribute(pos, 3 * t + 1); c.fromBufferAttribute(pos, 3 * t + 2)
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize()
    const centre = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }
    const u = nearestDirection(wall, centre)
    const across = Math.abs(-u.y * n.x + u.x * n.y)          // how squarely the face looks across the wall
    let slot = 0
    if (across >= ACROSS_MIN) {
      const probe = { x: centre.x + n.x * PROBE_BEYOND_FACE_M, y: centre.y + n.y * PROBE_BEYOND_FACE_M }
      const room = rooms.find((r) => pointInPolygon(probe, r.points))
      if (room) {
        let i = roomIds.indexOf(room.id)
        if (i < 0) { roomIds.push(room.id); i = roomIds.length - 1 }
        slot = i + 1
      }
    }
    slotOf[t] = slot
  }
  // Triangles sorted by slot, one draw group per slot.
  const order = Array.from({ length: triangles }, (_, t) => t).sort((p, q) => slotOf[p] - slotOf[q])
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(g.attributes)) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute
    const size = attr.itemSize
    const data = new (attr.array.constructor as Float32ArrayConstructor)(attr.array.length)
    order.forEach((t, k) => data.set(attr.array.subarray(3 * t * size, 3 * (t + 1) * size), 3 * k * size))
    out.setAttribute(name, new THREE.BufferAttribute(data, size, attr.normalized))
  }
  let start = 0
  for (let k = 1; k <= triangles; k++) {
    if (k === triangles || slotOf[order[k]] !== slotOf[order[start]]) {
      out.addGroup(3 * start, 3 * (k - start), slotOf[order[start]])
      start = k
    }
  }
  g.dispose()
  return { geometry: out, roomIds }
}
