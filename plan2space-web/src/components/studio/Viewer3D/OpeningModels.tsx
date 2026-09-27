import React, { Component, ReactNode, Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DOOR_SWING_S, doorOpenFraction, GARAGE_ROLL_S, swingStep } from '../../../lib/interaction'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useEditorStore } from '../../../stores/editorStore'
import { Opening, Room, Wall } from '../../../services/geometryService'
import { doorSwingSign, isGarageDoor } from '../../../lib/doorSwing'
import { Catalog, CatalogDoor, CatalogGarageDoor, useCatalog } from '../../../services/catalogService'
import { GARAGE_DOOR_HEIGHT_M, segmentAngleAt, WINDOW_HEIGHT_M } from './cutOpenings'
import { doorLayout, windowParts } from './openingFixtures'

const FRAME_COLOUR = '#f4f1ea'

// A model that fails to load leaves the doorway empty instead of taking the whole 3D view down.
class Fallback extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

// How open (0..1, eased) a door is, moving towards `open` over `durationS`; refs only, no re-render per frame.
function useSwing(open: boolean, durationS: number, apply: (fraction: number) => void) {
  const elapsed = useRef(open ? durationS : 0)
  const applied = useRef(false)
  useFrame((_, delta) => {
    const step = swingStep(elapsed.current, open, delta, durationS, applied.current)
    elapsed.current = step.elapsed
    if (!step.apply) return
    applied.current = true
    apply(doorOpenFraction(step.elapsed, durationS))
  })
}

// Closed by default; an open door swings its leaves to the side the plan's swing arc shows.
function Door({ door, width, thickness, open }: { door: CatalogDoor; width: number; thickness: number; open: boolean }) {
  const frame = useGLTF(door.frame).scene
  const leaf = useGLTF(door.leaf).scene
  const layout = useMemo(() => doorLayout(width, thickness, door), [width, thickness, door])
  const frameClone = useMemo(() => frame.clone(true), [frame])
  const leafClones = useMemo(() => layout.leaves.map(() => leaf.clone(true)), [leaf, layout])
  const hinges = useRef<(THREE.Group | null)[]>([])
  useSwing(open, DOOR_SWING_S, (f) => layout.leaves.forEach((l, i) => { if (hinges.current[i]) hinges.current[i]!.rotation.y = l.rotationY * f }))
  // glTF is Y-up with the door's depth along z; +90° about X stands it in plan space (z up).
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={frameClone} scale={layout.frameScale} />
      {layout.leaves.map((l, i) => (
        <group key={i} ref={(g) => { hinges.current[i] = g }} position={l.position} rotation={[0, 0, 0]} scale={l.scale}>
          <primitive object={leafClones[i]} position={l.offset} />
        </group>
      ))}
    </group>
  )
}

// The roller door stretched to the doorway; its box sits on the wall's right, like a door's swing.
// Open, it rolls up: the curtain shrinks to 10 % of its height and rises into its box.
function GarageDoor({ door, width, open }: { door: CatalogGarageDoor; width: number; open: boolean }) {
  const scene = useGLTF(door.file).scene
  const clone = useMemo(() => scene.clone(true), [scene])
  const curtain = useRef<THREE.Group>(null)
  const sy = GARAGE_DOOR_HEIGHT_M / door.heightM
  useSwing(open, GARAGE_ROLL_S, (f) => {
    if (!curtain.current) return
    curtain.current.scale.y = sy * (1 - 0.9 * f)
    curtain.current.position.y = 0.9 * GARAGE_DOOR_HEIGHT_M * f
  })
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <group ref={curtain} scale={[width / door.widthM, sy, 1]}>
        <primitive object={clone} />
      </group>
    </group>
  )
}

function WindowFrame({ width, thickness }: { width: number; thickness: number }) {
  // High quality: real glass (transmission) that refracts and reflects the sky; low: a light see-through pane.
  const high = useEditorStore((s) => s.quality) === 'high'
  const glass = high
    ? <meshPhysicalMaterial color="#eef6ff" transmission={1} roughness={0.05} thickness={0.01} metalness={0} side={THREE.DoubleSide} />
    : <meshPhysicalMaterial color="#cfe8ff" transparent opacity={0.3} roughness={0.05} metalness={0} side={THREE.DoubleSide} />
  const parts = useMemo(() => windowParts(width, WINDOW_HEIGHT_M, thickness), [width, thickness])
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} position={p.center} castShadow={p.kind === 'frame'}>
          <boxGeometry args={p.size} />
          {p.kind === 'frame'
            ? <meshStandardMaterial color={FRAME_COLOUR} roughness={0.6} />
            : glass}
        </mesh>
      ))}
    </>
  )
}

function OpeningModel({ opening, wall, rooms, catalog }: { opening: Opening; wall: Wall; rooms: Room[]; catalog: Catalog | null }) {
  const open = useEditorStore((s) => s.openDoors.has(opening.id))
  const door = catalog?.door
  const garage = isGarageDoor(opening, wall, rooms) ? catalog?.garageDoor : null
  // The door model swings towards the wall's right; turning it half round swings it into the room on the left.
  const swingsLeft = opening.type === 'Door' && doorSwingSign(opening, wall, rooms) === 1
  const angle = segmentAngleAt(wall, opening.position) + (swingsLeft ? Math.PI : 0)
  return (
    <group userData={{ pick: { kind: 'opening', id: opening.id } }} position={[opening.position.x, opening.position.y, opening.sillHeightMeters]} rotation={[0, 0, angle]}>
      {opening.type === 'Window'
        ? <WindowFrame width={opening.widthMeters} thickness={wall.thicknessMeters} />
        : door && (
          <Fallback>
            <Suspense fallback={null}>
              {garage
                ? <GarageDoor door={garage} width={opening.widthMeters} open={open} />
                : <Door door={door} width={opening.widthMeters} thickness={wall.thicknessMeters} open={open} />}
            </Suspense>
          </Fallback>
        )}
    </group>
  )
}

// Doors (the catalog's door model, left open) and windows (a frame fitted to the opening) in plan space.
export function OpeningModels({ walls, openings, rooms }: { walls: Wall[]; openings: Opening[]; rooms: Room[] }) {
  const catalog = useCatalog()
  return (
    <>
      {openings.map((o) => {
        const wall = walls.find((w) => w.id === o.wallId)
        return wall ? <OpeningModel key={o.id} opening={o} wall={wall} rooms={rooms} catalog={catalog} /> : null
      })}
    </>
  )
}
