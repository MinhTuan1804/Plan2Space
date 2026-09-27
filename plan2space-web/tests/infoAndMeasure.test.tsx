import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { render, screen, cleanup } from '@testing-library/react'
import { distance3, findPick, formatArea, formatMetres } from '../src/lib/measure'
import { InfoCard } from '../src/components/studio/Viewer3D/InfoCard'
import { useEditorStore } from '../src/stores/editorStore'
import { useGeometryStore } from '../src/stores/geometryStore'

vi.mock('../src/services/catalogService', () => ({
  useCatalog: () => ({ byId: { bed_double: { id: 'bed_double', name: 'Giường đôi', widthM: 1.6, depthM: 2, heightM: 1 } } }),
}))

describe('measure and pick helpers', () => {
  it('finds the pick on an ancestor, and none on a bare mesh', () => {
    const group = new THREE.Group(); group.userData.pick = { kind: 'furniture', id: 'f' }
    const inner = new THREE.Group(); const mesh = new THREE.Mesh()
    group.add(inner); inner.add(mesh)
    expect(findPick(mesh)).toEqual({ kind: 'furniture', id: 'f' })
    expect(findPick(new THREE.Mesh())).toBeNull()
  })
  it('measures and formats', () => {
    expect(distance3([0, 0, 0], [3, 4, 0])).toBe(5)
    expect(formatMetres(3.456)).toBe('3.46 m')
    expect(formatArea(19.72)).toBe('19.7 m²')
  })
})

describe('the info card', () => {
  beforeEach(() => {
    cleanup()
    useGeometryStore.setState({
      furniture: [{ id: 'f', catalogId: 'bed_double', x: 1, y: 1, rotationDeg: 0 }],
      openings: [{ id: 'o', wallId: 'w', type: 'Door', position: { x: 0, y: 0 }, widthMeters: 0.9, sillHeightMeters: 0, version: 1, doorStyle: 'garage' }],
      rooms: [{ id: 'r', label: 'MASTER', version: 1, level: 1, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }, { x: 0, y: 5 }, { x: 0, y: 0 }] }],
    })
  })
  it('names furniture with its size', () => {
    useEditorStore.setState({ picked: { kind: 'furniture', id: 'f' } })
    render(<InfoCard />)
    expect(screen.getByText('Giường đôi')).toBeTruthy()
    expect(screen.getByText('1.60 × 2.00 × 1.00 m')).toBeTruthy()
  })
  it('names a door with its width and style', () => {
    useEditorStore.setState({ picked: { kind: 'opening', id: 'o' } })
    render(<InfoCard />)
    expect(screen.getByText('Cửa đi')).toBeTruthy()
    expect(screen.getByText(/0.90 m/)).toBeTruthy()
    expect(screen.getByText(/garage/i)).toBeTruthy()
  })
  it('names a room with its area and storey', () => {
    useEditorStore.setState({ picked: { kind: 'room', id: 'r' } })
    render(<InfoCard />)
    expect(screen.getByText('MASTER')).toBeTruthy()
    expect(screen.getByText('20.0 m² · Tầng 2')).toBeTruthy()
  })
  it('shows nothing without a pick', () => {
    useEditorStore.setState({ picked: null })
    const { container } = render(<InfoCard />)
    expect(container.textContent).toBe('')
  })
})

import { isClick } from '../src/lib/measure'
import { sameMarker } from '../src/components/studio/Viewer3D/ViewTracker'

describe('clicks and view updates', () => {
  it('a drag that orbits the view is not a click', () => {
    expect(isClick(0)).toBe(true); expect(isClick(2)).toBe(true); expect(isClick(12)).toBe(false)
  })
  it('an unmoved view is the same marker; a moved one is not', () => {
    const m = { x: 1, y: 2, headingDeg: 30, targetHeight: 1.2, camera: [4, 5, 6] as [number, number, number] }
    expect(sameMarker(m, { ...m, x: 1.0001 })).toBe(true)
    expect(sameMarker(m, { ...m, x: 1.2 })).toBe(false)
    expect(sameMarker(m, { ...m, headingDeg: 35 })).toBe(false)
    expect(sameMarker(null, m)).toBe(false)
  })
})
