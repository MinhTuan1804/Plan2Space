import React from 'react'
import { Html, Line } from '@react-three/drei'
import { Vec3 } from '../../../services/viewSettingsService'
import { distance3, formatMetres } from '../../../lib/measure'

// The measure in world space: the points clicked so far (one or two) and, with two, the line and its length.
export function MeasureTool({ points }: { points: Vec3[] }) {
  if (points.length === 0) return null
  const [a, b] = points
  return (
    <>
      {points.map((p, i) => (
        <mesh key={i} position={p}><sphereGeometry args={[0.05, 12, 12]} /><meshBasicMaterial color="#f59e0b" depthTest={false} /></mesh>
      ))}
      {b && (
        <>
          <Line points={[a, b]} color="#f59e0b" lineWidth={2} depthTest={false} />
          <Html position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center>
            <div className="rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-black whitespace-nowrap">{formatMetres(distance3(a, b))}</div>
          </Html>
        </>
      )}
    </>
  )
}
