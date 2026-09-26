import React, { useMemo } from 'react'
import * as THREE from 'three'
import { Opening, Point, Room } from '../../../services/geometryService'
import { Point3, stairGeometry } from './stairs'

const STEP_COLOUR = '#c9b79c'
const RAIL_COLOUR = '#3f3f46'
const LANDING_THICKNESS_M = 0.15
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

// A generated dog-leg stair filling a stair well, rising `rise` metres to the level above.
export function StairModel({ well, rise, openings }: { well: Room; rise: number; openings: Opening[] }) {
  const stair = useMemo(() => stairGeometry(well.points, rise, wellEntry(well, openings)), [well, rise, openings])
  const riser = rise / (stair.treads.length + 1)
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
      {stair.handrails.map(([a, b], i) => <Rail key={i} a={a} b={b} />)}
    </>
  )
}
