import React, { useMemo } from 'react'
import * as THREE from 'three'
import { Opening, Point, Room, Wall } from '../../../services/geometryService'
import { levelOf, storeyHeight } from '../../../lib/levels'
import { Point3, StairPlan, stairGeometry, Tread } from './stairs'
import { upperExit } from './slabs'

const STEP_COLOUR = '#c9b79c'
const RAIL_COLOUR = '#3f3f46'
const LANDING_THICKNESS_M = 0.15
const WAIST_M = 0.15            // the sloping slab under each flight
const DOOR_ON_WELL_M = 0.3

function distanceToOutline(p: Point, poly: Point[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const l2 = dx * dx + dy * dy
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy))
  }
  return best
}

// The way into a stair well: a door on its outline, if it has one.
export function wellEntry(well: Room, openings: Opening[]): Point | null {
  return openings.find((o) => o.type === 'Door' && distanceToOutline(o.position, well.points) <= DOOR_ON_WELL_M)?.position ?? null
}

// The stair in a well on `level`: entered by its door, arriving where the floor above can be walked onto.
// The 3D view and walking both build it here, so the steps drawn are the steps walked.
export function stairFor(well: Room, level: number, walls: Wall[], rooms: Room[], openings: Opening[]): StairPlan {
  return stairGeometry(well.points, storeyHeight(walls, level),
    wellEntry(well, openings.filter((o) => levelOf(o) === level)), upperExit(rooms, walls, level))
}

function Rail({ a, b }: { a: Point3; b: Point3 }) {
  const [position, quaternion, length] = useMemo(() => {
    const from = new THREE.Vector3(a.x, a.y, a.z), to = new THREE.Vector3(b.x, b.y, b.z)
    const dir = to.clone().sub(from)
    return [from.clone().add(to).multiplyScalar(0.5),
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()), dir.length()]
  }, [a, b])
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[0.02, 0.02, length, 8]} />
      <meshStandardMaterial color={RAIL_COLOUR} metalness={0.4} roughness={0.5} />
    </mesh>
  )
}

// The slab a flight's steps sit on, sloping from under its first tread to under its last.
function Waist({ first, last, riser }: { first: Tread; last: Tread; riser: number }) {
  const dx = last.x - first.x, dy = last.y - first.y
  const run = Math.hypot(dx, dy)
  const going = Math.abs(dx) > Math.abs(dy) ? first.w : first.d
  const width = Math.abs(dx) > Math.abs(dy) ? first.d : first.w
  const rise = last.top - first.top
  const pitch = Math.atan2(rise, run)
  const z = (first.top + last.top) / 2 - riser - WAIST_M / (2 * Math.cos(pitch))
  return (
    <group position={[(first.x + last.x) / 2, (first.y + last.y) / 2, z]} rotation={[0, 0, Math.atan2(dy, dx)]}>
      <mesh rotation={[0, -pitch, 0]} castShadow receiveShadow>
        <boxGeometry args={[Math.hypot(run + going, rise + riser), width, WAIST_M]} />
        <meshStandardMaterial color={STEP_COLOUR} roughness={0.8} />
      </mesh>
    </group>
  )
}

// A generated dog-leg stair filling a stair well, rising `rise` metres to the level above.
export function StairModel({ stair, rise }: { stair: StairPlan; rise: number }) {
  const riser = rise / (stair.treads.length + 1)
  const half = Math.floor(stair.treads.length / 2)          // flight one's treads come first
  const flights = [stair.treads.slice(0, half), stair.treads.slice(half)]
  return (
    <>
      {stair.treads.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.top - riser / 2]} castShadow receiveShadow>
          <boxGeometry args={[t.w, t.d, riser]} />
          <meshStandardMaterial color={STEP_COLOUR} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[stair.landing.x, stair.landing.y, stair.landing.top - LANDING_THICKNESS_M / 2]} castShadow receiveShadow>
        <boxGeometry args={[stair.landing.w, stair.landing.d, LANDING_THICKNESS_M]} />
        <meshStandardMaterial color={STEP_COLOUR} roughness={0.8} />
      </mesh>
      {flights.map((f, i) => f.length > 1 && <Waist key={`w${i}`} first={f[0]} last={f[f.length - 1]} riser={riser} />)}
      {stair.handrails.map(([a, b], i) => <Rail key={i} a={a} b={b} />)}
    </>
  )
}
