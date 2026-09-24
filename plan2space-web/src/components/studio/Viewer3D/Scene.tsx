import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Center } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { HouseModel } from './HouseModel'
import { Eye, Footprints } from 'lucide-react'

export function Scene() {
  const setWalking = useEditorStore((s) => s.setWalking)
  const wallCount = useGeometryStore((s) => s.walls.length)
  return (
    <div className="w-full h-full relative bg-[#09090b]">
      {/* 3D Viewport HUD overlay */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-[#121215]/80 backdrop-blur border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400">
        <Eye className="w-3.5 h-3.5 text-blue-400" />
        <span>3D Perspective</span>
        <span>·</span>
        <span>60 FPS</span>
        <button
          onClick={() => setWalking(true)}
          disabled={wallCount === 0}
          title={wallCount === 0 ? 'Draw or import walls first' : 'Walk through the house'}
          className="ml-2 flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-white disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          <Footprints className="w-3.5 h-3.5" />
          <span>Walk</span>
        </button>
      </div>

      <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800/80">
        <span>Rotate: Left Click</span>
        <span>·</span>
        <span>Pan: Right Click</span>
        <span>·</span>
        <span>Zoom: Scroll</span>
      </div>

      <Canvas
        shadows
        camera={{ position: [12, 12, 12], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <hemisphereLight args={['#fdfbf5', '#8a7a66', 0.8]} />
        <directionalLight position={[15, 25, 10]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 2 + 0.05}
        />

        {/* CAD Floor Grid */}
        <Grid
          position={[0, -0.01, 0]}
          args={[30, 30]}
          cellSize={1}
          cellThickness={0.8}
          cellColor="#27272a"
          sectionSize={5}
          sectionThickness={1.2}
          sectionColor="#3f3f46"
          fadeDistance={30}
          fadeStrength={1.5}
        />

        {/* Group with orientation converting 2D plan XY to 3D XZ */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <HouseModel showCeilings={false} />
        </group>
      </Canvas>
    </div>
  )
}
