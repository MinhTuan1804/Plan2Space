// The door model is split into its frame and its leaf so the leaf can swing on its hinge in 3D.
// Both files share the frame's normalised space: metres, footprint centred, base at y = 0, front +Z.
const ASSUMED_DOOR_HEIGHT_M = 2.1   // unit guess: centimetre and millimetre sources both land near this

export function doorFit(door, leaf, hingeSide) {
  const rawHeight = door.max[1] - door.min[1]
  const scale = [1, 0.1, 0.01, 0.001].reduce((best, s) =>
    Math.abs(rawHeight * s - ASSUMED_DOOR_HEIGHT_M) < Math.abs(rawHeight * best - ASSUMED_DOOR_HEIGHT_M) ? s : best)
  const cx = (door.min[0] + door.max[0]) / 2
  const cz = (door.min[2] + door.max[2]) / 2
  const translation = [-scale * cx, -scale * door.min[1], -scale * cz]
  const at = (v, axis) => v * scale + translation[axis]
  return {
    scale,
    translation,
    widthM: (door.max[0] - door.min[0]) * scale,
    heightM: rawHeight * scale,
    depthM: (door.max[2] - door.min[2]) * scale,
    leafWidthM: (leaf.max[0] - leaf.min[0]) * scale,
    hingeX: at(hingeSide === 'min-x' ? leaf.min[0] : leaf.max[0], 0),
    hingeZ: at((leaf.min[2] + leaf.max[2]) / 2, 2),
  }
}
