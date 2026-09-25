import { DOOR_HEIGHT_M } from './cutOpenings'
import { DOUBLE_DOOR_MIN_WIDTH_M } from '../../../lib/doorSwing'

export { DOUBLE_DOOR_MIN_WIDTH_M }

// The catalog's door model (glTF axes: x across the doorway, y up, z through the wall; metres).
export interface DoorSpec {
  widthM: number
  heightM: number
  depthM: number
  leafWidthM: number
  hingeX: number
  hingeZ: number
}

export interface LeafPlacement {
  position: [number, number, number]   // the hinge, in the door's local glTF space
  rotationY: number                    // swung open 90°, towards the door's +z side
  scale: [number, number, number]      // negative x: the mirrored leaf of a double door
  offset: [number, number, number]     // moves the leaf model so its hinge sits at the group origin
}

export interface DoorLayout {
  frameScale: [number, number, number]
  leaves: LeafPlacement[]
}

// The frame is stretched to the opening (width, cut height, wall thickness). A narrow doorway takes the
// model's single leaf; a wide one takes two mirrored leaves hinged on either jamb.
export function doorLayout(openingWidthM: number, wallThicknessM: number, door: DoorSpec): DoorLayout {
  const sx = openingWidthM / door.widthM
  const sy = DOOR_HEIGHT_M / door.heightM
  const sz = wallThicknessM / door.depthM
  const offset: [number, number, number] = [-door.hingeX, 0, -door.hingeZ]
  const hingeZ = door.hingeZ * sz
  if (openingWidthM < DOUBLE_DOOR_MIN_WIDTH_M) {
    return {
      frameScale: [sx, sy, sz],
      leaves: [{ position: [door.hingeX * sx, 0, hingeZ], rotationY: -Math.PI / 2, scale: [sx, sy, sz], offset }],
    }
  }
  const jamb = (door.widthM / 2 + door.hingeX) * sx
  const leafScale = (openingWidthM / 2 - jamb) / door.leafWidthM
  const hingeX = openingWidthM / 2 - jamb
  return {
    frameScale: [sx, sy, sz],
    leaves: [
      { position: [-hingeX, 0, hingeZ], rotationY: -Math.PI / 2, scale: [leafScale, sy, sz], offset },
      { position: [hingeX, 0, hingeZ], rotationY: Math.PI / 2, scale: [-leafScale, sy, sz], offset },
    ],
  }
}

export interface WindowPart {
  kind: 'frame' | 'glass'
  center: [number, number, number]   // plan-local: x along the wall, y through it, z up from the sill
  size: [number, number, number]
}

const FRAME_BORDER_M = 0.05
const MULLION_M = 0.04
const PANE_TARGET_M = 0.6
const MAX_FRAME_DEPTH_M = 0.08

// A frame sized to any opening, with mullions dividing it into panes of about 0.6 m, and one sheet of glass.
export function windowParts(widthM: number, heightM: number, wallThicknessM: number): WindowPart[] {
  const depth = Math.min(wallThicknessM, MAX_FRAME_DEPTH_M)
  const b = FRAME_BORDER_M
  const parts: WindowPart[] = [
    { kind: 'frame', center: [0, 0, b / 2], size: [widthM, depth, b] },
    { kind: 'frame', center: [0, 0, heightM - b / 2], size: [widthM, depth, b] },
    { kind: 'frame', center: [-widthM / 2 + b / 2, 0, heightM / 2], size: [b, depth, heightM - 2 * b] },
    { kind: 'frame', center: [widthM / 2 - b / 2, 0, heightM / 2], size: [b, depth, heightM - 2 * b] },
  ]
  const inner = widthM - 2 * b
  const panes = Math.max(1, Math.round(inner / PANE_TARGET_M))
  for (let i = 1; i < panes; i++) {
    parts.push({ kind: 'frame', center: [-inner / 2 + (inner * i) / panes, 0, heightM / 2], size: [MULLION_M, depth, heightM - 2 * b] })
  }
  parts.push({ kind: 'glass', center: [0, 0, heightM / 2], size: [inner, 0.01, heightM - 2 * b] })
  return parts
}
