import React, { Suspense, useEffect, useMemo } from 'react'
import { LoadFallback } from './Atmosphere'
import { PbrFloor } from './FloorMaterialMesh'
import { RoomLights } from './RoomLights'
import { floorMaterialOf, FloorMaterialId } from '../../../lib/floorMaterials'
import * as THREE from 'three'
import { useGeometryStore } from '../../../stores/geometryStore'
import { Opening, Point, Room, Wall } from '../../../services/geometryService'
import { useWallGeometry } from './useWallGeometry'
import { floorPatches, FloorKind, wallHeight } from './floorPlan'
import { floorTexture } from './textures'
import { FurnitureModels } from './FurnitureModels'
import { OpeningModels } from './OpeningModels'
import { levelElevation, levelScene, levelsIn, PlanData, storeyHeight } from '../../../lib/levels'
import { LevelShell } from './LevelShell'
import { floorPieces, holeRooms, isShaft, stairWells } from './slabs'
import { StairModel, stairFor } from './StairModel'
import { wallEndExtensions } from './wallJoints'
import { splitWallFacesByRoom } from './wallPaint'

const FLOOR_FALLBACK: Record<FloorKind, string> = { wood: '#b98a5a', tile: '#e6e2da', pebble: '#a39c8e' }

export const WALL_PAINT = '#efe9df'

// Each long face takes the paint of the room it faces; everything else keeps the default paint.
function WallMesh({ wall, openings, extend, rooms }: { wall: Wall; openings: Opening[]; extend: [number, number]; rooms: Room[] }) {
  const solid = useWallGeometry(wall, openings, extend, rooms)
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

const NO_HOLES: Point[][] = []
function useShape(points: Point[], holes: Point[][] = NO_HOLES) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, p.y)))
    shape.holes = holes.map((h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))))
    return new THREE.ShapeGeometry(shape)
  }, [points, holes])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

// A room's floor in its PBR material; while that loads, or if it cannot, the painted floor of before.
function Floor({ points, kind, holes, roomId, material }:
    { points: Point[]; kind: FloorKind; holes?: Point[][]; roomId?: string; material?: FloorMaterialId }) {
  const geometry = useShape(points, holes)
  const texture = floorTexture(kind)
  const userData = roomId ? { pick: { kind: 'room', id: roomId } } : {}
  const painted = (
    <mesh geometry={geometry} position={[0, 0, 0.002]} receiveShadow userData={userData}>
      <meshStandardMaterial map={texture} color={texture ? '#ffffff' : FLOOR_FALLBACK[kind]} roughness={0.8} />
    </mesh>
  )
  if (!material) return painted
  return (
    <LoadFallback fallback={painted}>
      <Suspense fallback={painted}>
        <PbrFloor geometry={geometry} material={material} userData={userData} />
      </Suspense>
    </LoadFallback>
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
// Each level stands at its elevation (the storeys below it).
export function HouseModel({ showCeilings }: { showCeilings: boolean }) {
  const walls = useGeometryStore((s) => s.walls)
  const rooms = useGeometryStore((s) => s.rooms)
  const openings = useGeometryStore((s) => s.openings)
  const furniture = useGeometryStore((s) => s.furniture)
  const levels = levelsIn(walls)
  return (
    <>
      {(levels.length ? levels : [0]).map((level) => {
        const scene = levelScene({ walls, rooms, openings, furniture }, level)
        const isTop = level === Math.max(0, ...levels)
        const holes = holeRooms(rooms, level)
        return (
          <group key={level} position={[0, 0, levelElevation(walls, level)]}>
            <LevelModel {...scene} holes={holes} showCeilings={showCeilings && isTop} />
            <LevelShell rooms={rooms} level={level} walls={scene.walls} isTop={isTop} height={storeyHeight(walls, level)} />
            {stairWells(rooms, level).map((well) => (
              <StairModel key={well.id} stair={stairFor(well, level, walls, rooms, openings)} rise={storeyHeight(walls, level)} />
            ))}
          </group>
        )
      })}
    </>
  )
}

// A room standing over a well below (`holes`) is open; a wider room keeps its floor with the well cut out.
function LevelModel({ walls, rooms, openings, furniture, showCeilings, holes }:
    PlanData & { showCeilings: boolean; holes: Room[] }) {
  const floors = useMemo(() => {
    const solid = rooms.filter((r) => !isShaft(r, holes))
    if (rooms.length > 0 && solid.length === 0) return []
    return floorPatches(solid, walls).flatMap((f, i) => solid[i]
      ? floorPieces(solid[i], holes).map(([outer, ...inner]) => ({ kind: f.kind, points: outer, holes: inner, roomId: solid[i].id, material: floorMaterialOf(solid[i]) as FloorMaterialId | undefined }))
      : [{ ...f, holes: [] as Point[][], roomId: undefined as string | undefined, material: undefined as FloorMaterialId | undefined }])
  }, [rooms, walls, holes])
  const joints = useMemo(() => new Map(walls.map((w) => [w.id, wallEndExtensions(w, walls)])), [walls])
  const height = wallHeight(walls)

  return (
    <>
      {walls.map((wall) => <WallMesh key={wall.id} wall={wall} openings={openings} extend={joints.get(wall.id)!} rooms={rooms} />)}
      {floors.map((f, i) => <Floor key={i} points={f.points} kind={f.kind} holes={f.holes} roomId={f.roomId} material={f.material} />)}
      {showCeilings && floors.map((f, i) => <Ceiling key={i} points={f.points} height={height} />)}
      <OpeningModels walls={walls} openings={openings} rooms={rooms} />
      <FurnitureModels furniture={furniture} />
      <RoomLights rooms={rooms.filter((r) => !holes.includes(r))} ceilingZ={height} />
    </>
  )
}
