import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, cleanup } from '@testing-library/react'

const mounted: string[] = []
const toneModes: unknown[] = []
vi.mock('@react-three/fiber', () => ({ useThree: (f: (s: unknown) => unknown) => f({ clock: { elapsedTime: 0 } }) }))
vi.mock('@react-three/drei', () => ({
  Environment: () => null, PerformanceMonitor: () => null,
  SoftShadows: () => { mounted.push('softShadows'); return null },
}))
vi.mock('@react-three/postprocessing', () => ({
  EffectComposer: ({ children }: { children: React.ReactNode }) => { mounted.push('composer'); return <>{children}</> },
  N8AO: () => null, Bloom: () => null,
  ToneMapping: ({ mode }: { mode: unknown }) => { toneModes.push(mode); return null },
}))

import { Atmosphere } from '../src/components/studio/Viewer3D/Atmosphere'
import { useEditorStore } from '../src/stores/editorStore'
import { ToneMappingMode } from 'postprocessing'

describe('the atmosphere', () => {
  beforeEach(() => { cleanup(); mounted.length = 0; toneModes.length = 0; useEditorStore.setState({ quality: 'high' }) })

  it('one canvas at a time owns the soft shadows: the 3D view gives them up while walking', () => {
    render(<Atmosphere softShadows={false} />)
    expect(mounted).not.toContain('softShadows')
    cleanup(); mounted.length = 0
    render(<Atmosphere softShadows />)
    expect(mounted).toContain('softShadows')
  })

  it('keeps neutral tone mapping when the effect composer takes over', () => {
    render(<Atmosphere softShadows />)
    expect(mounted).toContain('composer')
    expect(toneModes).toEqual([ToneMappingMode.NEUTRAL])
  })

  it('low quality mounts neither', () => {
    useEditorStore.setState({ quality: 'low' })
    render(<Atmosphere softShadows />)
    expect(mounted).toEqual([])
  })
})
