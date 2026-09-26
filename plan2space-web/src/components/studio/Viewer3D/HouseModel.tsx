import React, { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGeometryStore } from '../../../stores/geometryStore'
import { Opening, Point, Room, Wall } from '../../../services/geometryService'
import { useWallGeometry } from './useWallGeometry'
import { floorPatches, FloorKind, wallHeight } from './floorPlan'
import { floorTexture } from './textures'
import { FurnitureModels } from './FurnitureModels'
import { OpeningModels } from './OpeningModels'
import { wallEndExtensions } from './wallJoints'
import { splitWallFacesByRoom } from './wallPaint'

const FLOOR_FALLBACK: Record<FloorKind, string> = { wood: '#b98a5a', tile: '#e6e2da' }

export const WALL_PAINT = '#efe9df'

// Each long face takes the paint of the room it faces; everything else keeps the default paint.
function WallMesh({ wall, openings, extend, rooms }: { wall: Wall; openings: Opening[]; extend: [number, number]; rooms: Room[] }) {
  const solid = useWallGeometry(wall, openings, extend)
  // Regrouped when the walls or the room outlines change; a new colour only swaps materials.
  const roomShapes = JSON.stringify(rooms.map((r) => [r.id, r.points]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { geometry, roomIds } = useMemo(() => splitWallFacesByRoom(solid, wall, rooms), [solid, wall, roomShapes])
  useEffect(() => () => geometry.dispose(), [geometry])
  const colours = [WALL_PAINT, ...roomIds.map((id) => rooms.find((r) => r.id === id)?.wallColor ?? WALL_PAINT)]
  const materials = useMemo(
    () => colours.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colours.join()])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])
  return <mesh geometry={geometry} material={materials} castShadow receiveShadow />
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
      {walls.map((wall) => <WallMesh key={wall.id} wall={wall} openings={openings} extend={joints.get(wall.id)!} rooms={rooms} />)}
      {floors.map((f, i) => <Floor key={i} points={f.points} kind={f.kind} />)}
      {showCeilings && floors.map((f, i) => <Ceiling key={i} points={f.points} height={height} />)}
      <OpeningModels />
      <FurnitureModels />
    </>
  )
}
