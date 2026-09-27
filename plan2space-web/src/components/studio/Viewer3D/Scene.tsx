import React, { Suspense, useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Center } from '@react-three/drei'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { HouseModel } from './HouseModel'
import { SunLight } from './SunLight'
import { SectionClipping, SectionPanel } from './SectionPanel'
import { SunStudyPanel, useSun } from './SunStudyPanel'
import { Atmosphere, QualityToggle } from './Atmosphere'
import { ViewMarker, ViewTracker } from './ViewTracker'
import { CameraRig } from './CameraRig'
import { ViewsPanel } from './ViewsPanel'
import { InfoCard } from './InfoCard'
import { MeasureTool } from './MeasureTool'
import { findPick, isClick } from '../../../lib/measure'
import { Vec3 } from '../../../services/viewSettingsService'
import { MiniMap } from '../MiniMap'
import { levelScene, levelsIn } from '../../../lib/levels'

const NIGHT_SKY_SHARE = 0.25
// The HDRI now carries most of the fill light; the hemisphere keeps a little, by day.
const DAY_SKY_SHARE = 0.4
import { SKY_LIGHT, TONE_MAPPING } from './lighting'
import { Eye, Footprints, Ruler } from 'lucide-react'

export function Scene() {
  const setWalking = useEditorStore((s) => s.setWalking)
  const walking = useEditorStore((s) => s.walking)
  const wallCount = useGeometryStore((s) => s.walls.length)
  const night = !useSun().up
  const [view, setView] = useState<ViewMarker | null>(null)
  const level = useEditorStore((s) => s.level)
  const setLevel = useEditorStore((s) => s.setLevel)
  const setFlyTo = useEditorStore((s) => s.setFlyTo)
  const plan = { walls: useGeometryStore((s) => s.walls), rooms: useGeometryStore((s) => s.rooms), openings: [], furniture: [] }
  const shown = levelScene(plan, level)
  const tool3d = useEditorStore((s) => s.tool3d)
  const setTool3d = useEditorStore((s) => s.setTool3d)
  const setPicked = useEditorStore((s) => s.setPicked)
  const [measure, setMeasure] = useState<Vec3[]>([])
  useEffect(() => {
    if (tool3d !== 'measure') { setMeasure([]); return }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMeasure([]) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tool3d])
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
        <button
          onClick={() => setTool3d(tool3d === 'measure' ? 'select' : 'measure')}
          disabled={wallCount === 0}
          aria-pressed={tool3d === 'measure'}
          className={`flex items-center gap-1 rounded px-2 py-0.5 ${tool3d === 'measure' ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-300'}`}
        >
          <Ruler className="w-3.5 h-3.5" />
          <span>Đo</span>
        </button>
        <QualityToggle />
      </div>

      {wallCount > 0 && (
        <div className="absolute top-14 right-4 z-10 flex flex-col gap-2">
          <SectionPanel />
          <ViewsPanel current={view} />
        </div>
      )}
      {wallCount > 0 && <SunStudyPanel />}
      <InfoCard />
      {wallCount > 0 && (
        <MiniMap walls={shown.walls} rooms={shown.rooms} levels={levelsIn(plan.walls)} level={level} onLevel={setLevel}
                 marker={view && { x: view.x, y: view.y, headingDeg: view.headingDeg }}
                 onPick={(p) => view && setFlyTo({
                   // Keep the camera's offset from what it looks at; move what it looks at to the click.
                   position: [view.camera[0] + p.x - view.x, view.camera[1] + p.y - view.y, view.camera[2]],
                   target: [p.x, p.y, view.targetHeight], level })} />
      )}

      <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800/80">
        <span>Rotate: Left Click</span>
        <span>·</span>
        <span>Pan: Right Click</span>
        <span>·</span>
        <span>Zoom: Scroll</span>
      </div>

      <Canvas
        onPointerMissed={() => setPicked(null)}
        shadows
        camera={{ position: [12, 12, 12], fov: 45 }}
        gl={{ antialias: true, alpha: true, toneMapping: TONE_MAPPING }}
      >
        <hemisphereLight args={[SKY_LIGHT.sky, SKY_LIGHT.ground, SKY_LIGHT.intensity * (night ? NIGHT_SKY_SHARE : DAY_SKY_SHARE)]} />
        <SunLight />
        <Atmosphere softShadows={!walking} />
        <SectionClipping />
        <ViewTracker onChange={setView} />
        <CameraRig />

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
        <group rotation={[-Math.PI / 2, 0, 0]}
               onClick={(e) => {
                 e.stopPropagation()
                 if (!isClick(e.delta)) return                                  // an orbit drag, not a click
                 if (tool3d === 'measure') {
                   const p = e.point.toArray() as Vec3
                   setMeasure((m) => (m.length >= 2 ? [p] : [...m, p]))   // a third click starts again
                 } else {
                   setPicked(findPick(e.object))
                 }
               }}>
          <HouseModel showCeilings={false} />
        </group>
        <MeasureTool points={measure} />
      </Canvas>
    </div>
  )
}
