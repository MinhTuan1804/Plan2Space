// One uniform scale fits the model into the catalog box (absorbing cm / mm / inch sources), a 90° turn aligns
// its long horizontal side with the catalog's long side, and the footprint is centred with the base at y = 0.
export function fitTransform(bounds, target, yawOffsetDeg = 0) {
  const [ex, ey, ez] = bounds.max.map((v, i) => v - bounds.min[i])
  const turn = (ex >= ez) !== (target.widthM >= target.depthM)
  const yawDeg = (turn ? 90 : 0) + yawOffsetDeg
  // Whatever turned the model (the long-side match or a model facing sideways), a quarter turn swaps its sides.
  const quarter = Math.round(yawDeg / 90) % 2 !== 0
  const [w0, d0] = quarter ? [ez, ex] : [ex, ez]
  const scale = Math.min(target.widthM / w0, target.depthM / d0, target.heightM / ey)
  const cx = (bounds.min[0] + bounds.max[0]) / 2
  const cz = (bounds.min[2] + bounds.max[2]) / 2
  const [rx, rz] = rotateY([cx, cz], yawDeg)
  return { scale, yawDeg, translation: [-scale * rx, -scale * bounds.min[1], -scale * rz] }
}

function rotateY([x, z], deg) {
  const a = (deg * Math.PI) / 180
  return [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)]
}

// glTF node transform order: translation · rotation · scale.
export function applyTransform([x, y, z], t) {
  const [rx, rz] = rotateY([x * t.scale, z * t.scale], t.yawDeg)
  return [rx + t.translation[0], y * t.scale + t.translation[1], rz + t.translation[2]]
}

export function yawQuaternion(deg) {
  const a = (deg * Math.PI) / 360
  return [0, Math.sin(a), 0, Math.cos(a)]
}
