import React, { Component, ReactNode, Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
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

function Door({ door, width, thickness }: { door: CatalogDoor; width: number; thickness: number }) {
  const frame = useGLTF(door.frame).scene
  const leaf = useGLTF(door.leaf).scene
  const layout = useMemo(() => doorLayout(width, thickness, door), [width, thickness, door])
  const frameClone = useMemo(() => frame.clone(true), [frame])
  const leafClones = useMemo(() => layout.leaves.map(() => leaf.clone(true)), [leaf, layout])
  // glTF is Y-up with the door's depth along z; +90° about X stands it in plan space (z up).
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={frameClone} scale={layout.frameScale} />
      {layout.leaves.map((l, i) => (
        <group key={i} position={l.position} rotation={[0, l.rotationY, 0]} scale={l.scale}>
          <primitive object={leafClones[i]} position={l.offset} />
        </group>
      ))}
    </group>
  )
}

// The roller door stretched to the doorway; its box sits on the wall's right, like a door's swing.
function GarageDoor({ door, width }: { door: CatalogGarageDoor; width: number }) {
  const scene = useGLTF(door.file).scene
  const clone = useMemo(() => scene.clone(true), [scene])
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={clone} scale={[width / door.widthM, GARAGE_DOOR_HEIGHT_M / door.heightM, 1]} />
    </group>
  )
}

function WindowFrame({ width, thickness }: { width: number; thickness: number }) {
  const parts = useMemo(() => windowParts(width, WINDOW_HEIGHT_M, thickness), [width, thickness])
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} position={p.center} castShadow={p.kind === 'frame'}>
          <boxGeometry args={p.size} />
          {p.kind === 'frame'
            ? <meshStandardMaterial color={FRAME_COLOUR} roughness={0.6} />
            : <meshPhysicalMaterial color="#cfe8ff" transparent opacity={0.3} roughness={0.05} metalness={0} side={THREE.DoubleSide} />}
        </mesh>
      ))}
    </>
  )
}

function OpeningModel({ opening, wall, rooms, catalog }: { opening: Opening; wall: Wall; rooms: Room[]; catalog: Catalog | null }) {
  const door = catalog?.door
  const garage = isGarageDoor(opening, wall, rooms) ? catalog?.garageDoor : null
  // The door model swings towards the wall's right; turning it half round swings it into the room on the left.
  const swingsLeft = opening.type === 'Door' && doorSwingSign(opening, wall, rooms) === 1
  const angle = segmentAngleAt(wall, opening.position) + (swingsLeft ? Math.PI : 0)
  return (
    <group position={[opening.position.x, opening.position.y, opening.sillHeightMeters]} rotation={[0, 0, angle]}>
      {opening.type === 'Window'
        ? <WindowFrame width={opening.widthMeters} thickness={wall.thicknessMeters} />
        : door && (
          <Fallback>
            <Suspense fallback={null}>
              {garage
                ? <GarageDoor door={garage} width={opening.widthMeters} />
                : <Door door={door} width={opening.widthMeters} thickness={wall.thicknessMeters} />}
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
