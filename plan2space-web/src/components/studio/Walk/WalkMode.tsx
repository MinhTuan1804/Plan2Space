import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { HouseModel } from '../Viewer3D/HouseModel'
import { SunLight } from '../Viewer3D/SunLight'
import { SKY_LIGHT, TONE_MAPPING } from '../Viewer3D/lighting'
import { EYE_HEIGHT_M, MAX_STEP_S, freeSpot, furnitureBlockers, furnitureFootprints, groundAt, levelForHeight, moveVector, settleSpawn, spawnPoint, stepPlayer, wallBlockers, WalkLevels } from '../../../lib/walkPhysics'
import { levelElevation, levelScene, levelsIn } from '../../../lib/levels'
import { holeRooms, stairWells } from '../Viewer3D/slabs'
import { stairFor } from '../Viewer3D/StairModel'

const EYE_EASE_S = 0.15
import { pointInPolygon } from '../../../lib/planGeometry'
import { useCatalog } from '../../../services/catalogService'
import { useMovementKeys } from './useMovementKeys'

// Plan (x, y) at height h is world (x, h, −y): the house group is rotated −90° about X.
// The player walks on one level at a time: its walls and furniture block, and the ground underfoot
// (floor or stair tread) sets the eye height, eased so a stair reads as steps rather than a jolt.
function Player() {
  const walls = useGeometryStore((s) => s.walls)
  const rooms = useGeometryStore((s) => s.rooms)
  const openings = useGeometryStore((s) => s.openings)
  const furniture = useGeometryStore((s) => s.furniture)
  const catalog = useCatalog()
  const levels = useMemo(() => { const l = levelsIn(walls); return l.length ? l : [0] }, [walls])
  // Beds, sofas and tables block like walls; wall-mounted items do not.
  const blockersByLevel = useMemo(() => new Map(levels.map((level) => {
    const scene = levelScene({ walls, rooms, openings, furniture }, level)
    return [level, [...wallBlockers(scene.walls, scene.openings), ...furnitureBlockers(scene.furniture, (id) => catalog?.byId[id])]]
  })), [levels, walls, rooms, openings, furniture, catalog])
  const world = useMemo<WalkLevels>(() => ({
    elevations: levels.map((level) => levelElevation(walls, level)),
    holes: levels.map((level) => holeRooms(rooms, level).map((r) => r.points)),
    floors: levels.map((level) => rooms.filter((r) => (r.level ?? 0) === level).map((r) => r.points)),
    stairs: levels.flatMap((level) => stairWells(rooms, level).map((well) => ({
      level,
      plan: stairFor(well, level, walls, rooms, openings),
    }))),
  }), [levels, walls, rooms, openings])
  const ground = levelScene({ walls, rooms, openings, furniture }, 0)
  const footprints = useMemo(() => furnitureFootprints(ground.furniture, (id) => catalog?.byId[id]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [furniture, catalog])
  const blockers0 = blockersByLevel.get(0) ?? []
  const position = useRef(settleSpawn(spawnPoint(ground.rooms, ground.walls), blockers0))
  const groundZ = useRef(0)
  const eye = useRef(EYE_HEIGHT_M)
  // The catalog arrives after the first render: a start the furniture now covers moves to a free spot
  // in the same room (auto-furnished sofas and dining sets often cover the room centre).
  useEffect(() => {
    const room = ground.rooms.find((r) => pointInPolygon(position.current, r.points))
    position.current = freeSpot(position.current, blockers0, footprints, room?.points)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, blockers0, footprints])
  const keys = useMovementKeys()
  const { camera } = useThree()
  const look = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    camera.position.set(position.current.x, eye.current, -position.current.y)
  }, [camera])

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_STEP_S)
    camera.getWorldDirection(look)
    const move = moveVector(keys.current, { x: look.x, y: -look.z }, dt)
    if (move.x !== 0 || move.y !== 0) {
      const level = levelForHeight(groundZ.current, world.elevations)
      const next = stepPlayer(position.current, move, blockersByLevel.get(level) ?? [])
      const z = groundAt(next, groundZ.current, world)
      if (z !== null) { position.current = next; groundZ.current = z }
    }
    eye.current += (groundZ.current + EYE_HEIGHT_M - eye.current) * Math.min(1, delta / EYE_EASE_S)
    camera.position.set(position.current.x, eye.current, -position.current.y)
  })
  return null
}

export function WalkMode() {
  const setWalking = useEditorStore((s) => s.setWalking)
  const [locked, setLocked] = useState(false)

  useEffect(() => () => { if (document.pointerLockElement) document.exitPointerLock() }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <Canvas shadows camera={{ fov: 70, near: 0.05, far: 200 }} gl={{ antialias: true, toneMapping: TONE_MAPPING }}>
        <color attach="background" args={['#cfe3f5']} />
        <hemisphereLight args={[SKY_LIGHT.sky, SKY_LIGHT.ground, SKY_LIGHT.intensity]} />
        <SunLight />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <HouseModel showCeilings />
        </group>
        {/* Only #walk-continue locks the pointer: without a selector drei locks on ANY click, Exit included. */}
        <PointerLockControls selector="#walk-continue" onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
        <Player />
      </Canvas>

      {locked && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-white/80" />
            <div className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-white/80" />
          </div>
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-xs text-white">
            W A S D to walk · Shift to run · mouse to look · Esc to pause
          </div>
        </>
      )}

      {/* Kept mounted and only hidden while locked: drei binds its click listener to this element once. */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/60 ${locked ? 'hidden' : ''}`}>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/90 p-6 text-white">
          <div className="text-sm">Walk through your plan</div>
          <button id="walk-continue" className="rounded bg-blue-600 px-4 py-2 text-sm">Click to walk</button>
          <button onClick={() => setWalking(false)} className="text-xs text-zinc-400 hover:text-white">Exit to the editor</button>
        </div>
      </div>
    </div>
  )
}
