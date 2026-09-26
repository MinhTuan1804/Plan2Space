import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SectionPanel } from '../src/components/studio/Viewer3D/SectionPanel'
import { useEditorStore } from '../src/stores/editorStore'
import { NO_CUT } from '../src/lib/sectionBox'

describe('the section panel', () => {
  beforeEach(() => { cleanup(); useEditorStore.setState({ section: null }) })

  it('turns the section box on, cuts with its sliders, and turns it off again', () => {
    render(<SectionPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Cắt lát' }))
    expect(useEditorStore.getState().section).toEqual(NO_CUT)
    fireEvent.change(screen.getByLabelText('Chiều cao'), { target: { value: '40' } })
    expect(useEditorStore.getState().section!.z).toBeCloseTo(0.4)
    fireEvent.change(screen.getByLabelText('Chiều ngang (x)'), { target: { value: '70' } })
    expect(useEditorStore.getState().section!.x).toBeCloseTo(0.7)
    fireEvent.click(screen.getByRole('button', { name: 'Cắt lát' }))
    expect(useEditorStore.getState().section).toBeNull()
  })
})
