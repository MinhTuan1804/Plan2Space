import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Center } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useWallGeometry } from './useWallGeometry'
import { Wall, Opening } from '../../../services/geometryService'
import { Eye } from 'lucide-react'

function WallMesh({ wall, openings }: { wall: Wall; openings: Opening[] }) {
  const geometry = useWallGeometry(wall, openings)
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#e4e4e7" roughness={0.4} metalness={0.05} />
    </mesh>
  )
}

export function Scene() {
  const walls = useGeometryStore((s) => s.walls)
  const openings = useGeometryStore((s) => s.openings)

  return (
    <div className="w-full h-full relative bg-[#09090b]">
      {/* 3D Viewport HUD overlay */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-[#121215]/80 backdrop-blur border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400">
        <Eye className="w-3.5 h-3.5 text-blue-400" />
        <span>3D Perspective</span>
        <span>·</span>
        <span>60 FPS</span>
      </div>

      <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800/80">
        <span>Rotate: Left Click</span>
        <span>·</span>
        <span>Pan: Right Click</span>
        <span>·</span>
        <span>Zoom: Scroll</span>
      </div>

      <Canvas
        camera={{ position: [12, 12, 12], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[15, 25, 15]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-10, 10, -10]} intensity={0.3} />

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
          {walls.map((wall) => (
            <WallMesh key={wall.id} wall={wall} openings={openings} />
          ))}
        </group>
      </Canvas>
    </div>
  )
}
