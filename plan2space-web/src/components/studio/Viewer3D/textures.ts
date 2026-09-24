import * as THREE from 'three'
import { FloorKind } from './floorPlan'

// One canvas = one metre of floor; floor UVs are plan metres, so repeat-wrapping tiles it per metre.
const SIZE = 256
const cache = new Map<FloorKind, THREE.Texture | null>()

function paintWood(ctx: CanvasRenderingContext2D) {
  const plank = SIZE / 5
  for (let i = 0; i < 5; i++) {
    const shade = 140 + ((i * 37) % 30)
    ctx.fillStyle = `rgb(${shade + 40}, ${shade}, ${shade - 55})`
    ctx.fillRect(0, i * plank, SIZE, plank)
    ctx.fillStyle = 'rgba(60, 35, 15, 0.35)'
    ctx.fillRect(0, i * plank, SIZE, 2)                      // seam between planks
    ctx.fillRect((i * 97) % SIZE, i * plank, 2, plank)       // staggered butt joint
  }
}

function paintTile(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#e9e6df'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = '#b9b4aa'
  for (const at of [0, SIZE / 2]) {                          // 50 cm tiles
    ctx.fillRect(at, 0, 3, SIZE)
    ctx.fillRect(0, at, SIZE, 3)
  }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d')
  } catch {
    return null   // jsdom without the canvas package
  }
}

export function floorTexture(kind: FloorKind): THREE.Texture | null {
  if (cache.has(kind)) return cache.get(kind)!
  let texture: THREE.Texture | null = null
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas')
  const ctx = canvas ? context2d(canvas) : null
  if (canvas && ctx) {
    canvas.width = canvas.height = SIZE
    if (kind === 'wood') paintWood(ctx)
    else paintTile(ctx)
    texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.colorSpace = THREE.SRGBColorSpace
  }
  cache.set(kind, texture)
  return texture
}
