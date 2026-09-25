import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGeometryStore } from '../../../stores/geometryStore'
import { Opening, Point, Wall } from '../../../services/geometryService'
import { useWallGeometry } from './useWallGeometry'
import { segmentAngleAt } from './cutOpenings'
import { floorPatches, FloorKind, wallHeight } from './floorPlan'
import { floorTexture } from './textures'
import { FurnitureModels } from './FurnitureModels'
import { wallEndExtensions } from './wallJoints'

const WALL_PAINT = '#efe9df'
const FLOOR_FALLBACK: Record<FloorKind, string> = { wood: '#b98a5a', tile: '#e6e2da' }
const WINDOW_HEIGHT_M = 1.2   // matches the CSG cut in cutOpenings.ts

function WallMesh({ wall, openings, extend }: { wall: Wall; openings: Opening[]; extend: [number, number] }) {
  const geometry = useWallGeometry(wall, openings, extend)
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={WALL_PAINT} roughness={0.9} metalness={0} />
    </mesh>
  )
}

function useShape(points: Point[]) {
  const geometry = useMemo(
    () => new THREE.ShapeGeometry(new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)))),
    [points]
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

function Floor({ points, kind }: { points: Point[]; kind: FloorKind }) {
  const geometry = useShape(points)
  const texture = floorTexture(kind)
  return (
    <mesh geometry={geometry} position={[0, 0, 0.002]} receiveShadow>
      <meshStandardMaterial map={texture} color={texture ? '#ffffff' : FLOOR_FALLBACK[kind]} roughness={0.8} />
    </mesh>
  )
}

function Ceiling({ points, height }: { points: Point[]; height: number }) {
  const geometry = useShape(points)
  return (
    <mesh geometry={geometry} position={[0, 0, height]}>
      <meshStandardMaterial color="#fbfaf7" side={THREE.DoubleSide} roughness={1} />
    </mesh>
  )
}

function WindowGlass({ opening, wall }: { opening: Opening; wall: Wall }) {
  const angle = segmentAngleAt(wall, opening.position)
  return (
    <mesh position={[opening.position.x, opening.position.y, opening.sillHeightMeters + WINDOW_HEIGHT_M / 2]}
          rotation={[0, 0, angle]}>
      <boxGeometry args={[opening.widthMeters, 0.02, WINDOW_HEIGHT_M]} />
      <meshPhysicalMaterial color="#cfe8ff" transparent opacity={0.3} roughness={0.05} metalness={0} />
    </mesh>
  )
}

// The house in plan space (x, y, height up). Callers place it inside a group rotated −90° about X.
export function HouseModel({ showCeilings }: { showCeilings: boolean }) {
  const walls = useGeometryStore((s) => s.walls)
  const rooms = useGeometryStore((s) => s.rooms)
  const openings = useGeometryStore((s) => s.openings)
  const floors = useMemo(() => floorPatches(rooms, walls), [rooms, walls])
  const joints = useMemo(() => new Map(walls.map((w) => [w.id, wallEndExtensions(w, walls)])), [walls])
  const height = wallHeight(walls)

  return (
    <>
      {walls.map((wall) => <WallMesh key={wall.id} wall={wall} openings={openings} extend={joints.get(wall.id)!} />)}
      {floors.map((f, i) => <Floor key={i} points={f.points} kind={f.kind} />)}
      {showCeilings && floors.map((f, i) => <Ceiling key={i} points={f.points} height={height} />)}
      {openings.filter((o) => o.type === 'Window').map((o) => {
        const wall = walls.find((w) => w.id === o.wallId)
        return wall ? <WindowGlass key={o.id} opening={o} wall={wall} /> : null
      })}
      <FurnitureModels />
    </>
  )
}
