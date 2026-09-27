import React from 'react'
import { Room } from '../../../services/geometryService'
import { useEditorStore } from '../../../stores/editorStore'
import { lightOn, roomLight } from '../../../lib/interaction'
import { useSun } from './SunStudyPanel'

const WARM = '#ffd9a0'

// A ceiling light in each room that is on: warm, no shadow (a house of lit rooms stays fast), and a small
// glowing fitting that the bloom picks up.
export function RoomLights({ rooms, ceilingZ }: { rooms: Room[]; ceilingZ: number }) {
  const overrides = useEditorStore((s) => s.lightsOverride)
  const night = !useSun().up
  return (
    <>
      {rooms.filter((r) => lightOn(r.id, overrides, night)).map((r) => {
        const { position, distance } = roomLight(r, ceilingZ)
        return (
          <group key={r.id} position={position}>
            <pointLight color={WARM} intensity={8} distance={distance} decay={2} castShadow={false} />
            <mesh position={[0, 0, 0.29]}>
              <circleGeometry args={[0.15, 24]} />
              <meshStandardMaterial color={WARM} emissive={WARM} emissiveIntensity={3} side={2} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}
