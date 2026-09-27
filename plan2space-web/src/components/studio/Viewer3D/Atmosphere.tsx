import React, { Component, ReactNode, Suspense, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment, PerformanceMonitor, SoftShadows } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEditorStore } from '../../../stores/editorStore'
import { shouldDowngrade } from '../../../lib/quality'
import { useSun } from './SunStudyPanel'

// Something that failed to load (a texture, the sky) renders `fallback` instead of taking the scene down.
export class LoadFallback extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children }
}

const DAY_ENV = 1
const NIGHT_ENV = 0.15

// What makes the view look lit rather than drawn: the sky's light and reflections (an HDRI, not shown as the
// background), and on high quality soft shadows, ambient occlusion and a little bloom. A machine that
// struggles while the scene settles in is moved to low quality once.
// Soft shadows patch three's global shadow shader: only one canvas may have them at a time (the 3D view gives
// them up while the walk is open).
export function Atmosphere({ softShadows = true }: { softShadows?: boolean }) {
  const quality = useEditorStore((s) => s.quality)
  const setQuality = useEditorStore((s) => s.setQuality)
  const clock = useThree((s) => s.clock)
  const downgraded = useRef(false)
  const night = !useSun().up
  const high = quality === 'high'
  return (
    <>
      <PerformanceMonitor onDecline={() => {
        if (!shouldDowngrade(clock.elapsedTime, downgraded.current) || !high) return
        downgraded.current = true
        setQuality('low')
      }} />
      <LoadFallback>
        <Suspense fallback={null}>
          <Environment files="/hdri/sky_1k.hdr" environmentIntensity={night ? NIGHT_ENV : DAY_ENV} />
        </Suspense>
      </LoadFallback>
      {high && softShadows && <SoftShadows size={25} samples={10} focus={0} />}
      {high && (
        <EffectComposer enableNormalPass={false}>
          <N8AO aoRadius={0.5} intensity={2} distanceFalloff={1} />
          <Bloom luminanceThreshold={0.9} intensity={0.3} />
          {/* The composer switches the renderer's tone mapping off; keep the neutral one the view is tuned for. */}
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      )}
    </>
  )
}

// The Cao/Thấp switch for the HUDs.
export function QualityToggle() {
  const quality = useEditorStore((s) => s.quality)
  const setQuality = useEditorStore((s) => s.setQuality)
  return (
    <button onClick={() => setQuality(quality === 'high' ? 'low' : 'high')} title="Chất lượng hiển thị"
            className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
      {quality === 'high' ? 'Cao' : 'Thấp'}
    </button>
  )
}
