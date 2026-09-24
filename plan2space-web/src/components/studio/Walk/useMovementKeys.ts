import { useEffect, useRef } from 'react'
import { MoveKeys } from '../../../lib/walkPhysics'

// Physical key codes, so the layout (QWERTY, AZERTY…) does not move the controls around.
export function keysFromCodes(pressed: Set<string>): MoveKeys {
  const any = (...codes: string[]) => codes.some((c) => pressed.has(c))
  return {
    forward: any('KeyW', 'ArrowUp'),
    back: any('KeyS', 'ArrowDown'),
    left: any('KeyA', 'ArrowLeft'),
    right: any('KeyD', 'ArrowRight'),
    run: any('ShiftLeft', 'ShiftRight'),
  }
}

export function useMovementKeys() {
  const keys = useRef<MoveKeys>(keysFromCodes(new Set()))
  useEffect(() => {
    const pressed = new Set<string>()
    const update = () => { keys.current = keysFromCodes(pressed) }
    const down = (e: KeyboardEvent) => { pressed.add(e.code); update() }
    const up = (e: KeyboardEvent) => { pressed.delete(e.code); update() }
    const blur = () => { pressed.clear(); update() }       // a key released outside the window must not stick
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return keys
}
