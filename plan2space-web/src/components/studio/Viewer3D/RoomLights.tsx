import React from 'react'
import { Room, Wall } from '../../../services/geometryService'
import { useEditorStore } from '../../../stores/editorStore'
import { levelElevation, levelOf, storeyHeight } from '../../../lib/levels'
import { lightOn, lightPool, roomLight } from '../../../lib/interaction'
import { useSun } from './SunStudyPanel'

const WARM = '#ffd9a0'
const POOL = 8

// The house's room lights. Every lit room shows its glowing fitting; a fixed pool of eight warm point lights
// (the storey on view first, then larger rooms) does the lighting. The pool never changes size, so switching a
// light only moves or dims one: no shader recompiles. No shadows, to stay fast.
export function RoomLights({ rooms, walls }: { rooms: Room[]; walls: Wall[] }) {
  const overrides = useEditorStore((s) => s.lightsOverride)
  const focus = useEditorStore((s) => s.level)
  const night = !useSun().up
  const lit = rooms.filter((r) => lightOn(r.id, overrides, night))
  const place = (r: Room) => {
    const level = levelOf(r)
    const { position, distance } = roomLight(r, storeyHeight(walls, level))
    return { position: [position[0], position[1], position[2] + levelElevation(walls, level)] as [number, number, number], distance }
  }
  return (
    <>
      {lightPool(lit, focus, POOL).map((r, i) => {
        const at = r && place(r)
        return <pointLight key={i} color={WARM} intensity={at ? 8 : 0} distance={at ? at.distance : 1} decay={2}
                           position={at ? at.position : [0, 0, -100]} castShadow={false} />
      })}
      {lit.map((r) => (
        <mesh key={r.id} position={place(r).position.map((v, k) => (k === 2 ? v + 0.29 : v)) as [number, number, number]}>
          <circleGeometry args={[0.15, 24]} />
          <meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={3} side={2} />
        </mesh>
      ))}
    </>
  )
}
