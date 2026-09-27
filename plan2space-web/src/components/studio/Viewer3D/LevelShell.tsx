import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Point, Room, Wall } from '../../../services/geometryService'
import { floorPieces, holeRooms, isShaft, railingRuns, RAILING_HEIGHT_M, SLAB_THICKNESS_M } from './slabs'
import { isLightWellName } from '../../../lib/roomTypes'

const POST_SPACING_M = 1.2
const RAIL_M = 0.05

function Slab({ points, holes }: { points: Point[]; holes: Point[][] }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)))
    shape.holes = holes.map((h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))))
    return new THREE.ExtrudeGeometry(shape, { depth: SLAB_THICKNESS_M, bevelEnabled: false })
  }, [points, holes])
  useEffect(() => () => geometry.dispose(), [geometry])
  // Top face at the level's floor, so it shows as the ceiling of the storey below.
  return (
    <mesh geometry={geometry} position={[0, 0, -SLAB_THICKNESS_M - 0.001]} castShadow receiveShadow>
      <meshStandardMaterial color="#d9d6cf" roughness={0.95} />
    </mesh>
  )
}

function Railing({ a, b }: { a: Point; b: Point }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  const posts = Math.max(2, Math.ceil(length / POST_SPACING_M) + 1)
  return (
    <group position={[a.x, a.y, 0]} rotation={[0, 0, angle]}>
      <mesh position={[length / 2, 0, RAILING_HEIGHT_M]}><boxGeometry args={[length, RAIL_M, RAIL_M]} /><meshStandardMaterial color="#3f3f46" metalness={0.4} roughness={0.5} /></mesh>
      {Array.from({ length: posts }, (_, i) => (
        <mesh key={i} position={[(length * i) / (posts - 1), 0, RAILING_HEIGHT_M / 2]}>
          <boxGeometry args={[RAIL_M, RAIL_M, RAILING_HEIGHT_M]} /><meshStandardMaterial color="#3f3f46" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[length / 2, 0, RAILING_HEIGHT_M / 2]}>
        <boxGeometry args={[length, 0.01, RAILING_HEIGHT_M - 0.1]} />
        <meshPhysicalMaterial color="#cfe8ff" transparent opacity={0.25} roughness={0.05} />
      </mesh>
    </group>
  )
}

function GlassRoof({ points, height }: { points: Point[]; height: number }) {
  const geometry = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)))), [points])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, 0, height]}>
      <meshPhysicalMaterial color="#dff1ff" transparent opacity={0.3} roughness={0.05} side={THREE.DoubleSide} />
    </mesh>
  )
}

// What a level adds beyond its walls and floors: the slab it stands on (open over the stair and light
// wells below), railings round those openings, and glass over light wells at the top of the house.
export function LevelShell({ rooms, level, walls, isTop, height }:
    { rooms: Room[]; level: number; walls: Wall[]; isTop: boolean; height: number }) {
  const holes = holeRooms(rooms, level)
  const slab = rooms.filter((r) => (r.level ?? 0) === level && !isShaft(r, holes))
  return (
    <>
      {level > 0 && slab.flatMap((r) => floorPieces(r, holes).map(([outer, ...inner], i) => <Slab key={`${r.id}-${i}`} points={outer} holes={inner} />))}
      {holes.flatMap((h) => railingRuns(h.points, walls).map(([a, b], i) => <Railing key={`${h.id}-${i}`} a={a} b={b} />))}
      {isTop && holes.filter((h) => isLightWellName(h.label)).map((h) => <GlassRoof key={h.id} points={h.points} height={height} />)}
    </>
  )
}
