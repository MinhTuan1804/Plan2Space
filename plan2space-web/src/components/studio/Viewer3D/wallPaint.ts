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

// A long wall runs past several rooms while its face is a few large triangles, so a triangle can span two
// rooms. Each triangle is cut by the vertical planes through the room corners that lie on the wall, so every
// piece belongs to one room.
function roomBreaks(wall: Wall, rooms: Room[]): { at: Point; u: Point }[] {
  const breaks: { at: Point; u: Point }[] = []
  const reach = wall.thicknessMeters / 2 + PROBE_BEYOND_FACE_M + 0.05
  for (let i = 0; i < wall.points.length - 1; i++) {
    const a = wall.points[i]
    const b = wall.points[i + 1]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length === 0) continue
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    for (const room of rooms) {
      for (const v of room.points) {
        const along = (v.x - a.x) * u.x + (v.y - a.y) * u.y
        const across = Math.abs(-(v.x - a.x) * u.y + (v.y - a.y) * u.x)
        if (across > reach || along <= 1e-6 || along >= length - 1e-6) continue
        if (breaks.some((k) => Math.abs((v.x - k.at.x) * k.u.x + (v.y - k.at.y) * k.u.y) < 1e-6 && k.u.x === u.x && k.u.y === u.y)) continue
        breaks.push({ at: { x: a.x + u.x * along, y: a.y + u.y * along }, u })
      }
    }
  }
  return breaks
}

type Vertex = number[][]   // one array per attribute

// Splits every triangle crossing the plane through `at` with normal `u` (horizontal, in plan space),
// interpolating all attributes along the cut edges and keeping the winding.
function cutTriangles(tris: Vertex[][], at: Point, u: Point): Vertex[][] {
  const side = (v: Vertex) => (v[0][0] - at.x) * u.x + (v[0][1] - at.y) * u.y
  const lerp = (p: Vertex, q: Vertex, t: number): Vertex => p.map((attr, k) => attr.map((x, j) => x + (q[k][j] - x) * t))
  const out: Vertex[][] = []
  for (const tri of tris) {
    const d = tri.map(side)
    const above = d.map((x) => x > 1e-9)
    const below = d.map((x) => x < -1e-9)
    if (!above.some(Boolean) || !below.some(Boolean)) { out.push(tri); continue }
    // The vertex alone on its side, then the other two in winding order.
    const lone = [0, 1, 2].find((k) => (above[k] && !above[(k + 1) % 3] && !above[(k + 2) % 3])
                                      || (below[k] && !below[(k + 1) % 3] && !below[(k + 2) % 3]))
    if (lone === undefined) { out.push(tri); continue }   // a vertex on the plane: the other two straddle it
    const k1 = (lone + 1) % 3
    const k2 = (lone + 2) % 3
    const A = lerp(tri[lone], tri[k1], d[lone] / (d[lone] - d[k1]))
    const B = lerp(tri[lone], tri[k2], d[lone] / (d[lone] - d[k2]))
    out.push([tri[lone], A, B], [A, tri[k1], tri[k2]], [A, tri[k2], B])
  }
  return out
}

function splitAtRoomCorners(g: THREE.BufferGeometry, wall: Wall, rooms: Room[]): THREE.BufferGeometry {
  const breaks = roomBreaks(wall, rooms)
  if (breaks.length === 0) return g
  const names = Object.keys(g.attributes)
  const attrs = names.map((n) => g.getAttribute(n) as THREE.BufferAttribute)
  const vertex = (i: number): Vertex => attrs.map((a) => Array.from({ length: a.itemSize }, (_, j) => a.array[i * a.itemSize + j] as number))
  let tris: Vertex[][] = []
  for (let t = 0; t < attrs[0].count / 3; t++) tris.push([vertex(3 * t), vertex(3 * t + 1), vertex(3 * t + 2)])
  for (const k of breaks) tris = cutTriangles(tris, k.at, k.u)
  const out = new THREE.BufferGeometry()
  names.forEach((n, i) => {
    const size = attrs[i].itemSize
    out.setAttribute(n, new THREE.BufferAttribute(new Float32Array(tris.flatMap((tri) => tri.flatMap((v) => v[i]))), size))
  })
  g.dispose()
  return out
}

// Regroups a wall mesh so each long face is drawn with the paint of the room it faces. Material slot 0 is the
// default paint (outside faces, ends, top, jambs); slot i + 1 belongs to roomIds[i]. Depends only on the
// walls and rooms, so changing a colour swaps materials without rebuilding the geometry.
export function splitWallFacesByRoom(source: THREE.BufferGeometry, wall: Wall, rooms: Room[]):
    { geometry: THREE.BufferGeometry; roomIds: string[] } {
  const flat = source.index ? source.toNonIndexed() : source.clone()
  flat.clearGroups()
  // A zero-length wall builds no geometry at all: nothing to paint, and one such wall must not crash the scene.
  if (!flat.getAttribute('position')) return { geometry: flat, roomIds: [] }
  const g = splitAtRoomCorners(flat, wall, rooms)
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
