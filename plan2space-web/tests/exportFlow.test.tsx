import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '../src/services/api'
import * as exportService from '../src/services/exportService'
import { downloadExport } from '../src/services/exportService'
import { StudioToolbar } from '../src/components/studio/StudioToolbar'

describe('export', () => {
  let clicked: HTMLAnchorElement[] = []
  beforeEach(() => {
    clicked = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this) })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('downloads the exported file under the name the API gives it', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: new Blob(['glTF']), headers: { 'content-disposition': 'attachment; filename=My-House.glb; filename*=UTF-8\'\'My-House.glb' }
    })

    await downloadExport('p1', 'glb')

    expect(post).toHaveBeenCalledWith('/export/p1?format=glb', null, { responseType: 'blob' })
    expect(clicked).toHaveLength(1)
    expect(clicked[0].download).toBe('My-House.glb')
    expect(clicked[0].href).toBe('blob:fake')
  })

  it('surfaces the API message from a blob error body', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({
      response: { status: 422, data: new Blob([JSON.stringify({ message: 'The plan has no walls — nothing to export' })]) }
    })
    await expect(downloadExport('p1', 'pdf')).rejects.toThrow('nothing to export')
  })

  it('toolbar offers every export format and exports the chosen one', async () => {
    const download = vi.spyOn(exportService, 'downloadExport').mockResolvedValue('x.pdf')
    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    for (const label of [/glb/i, /gltf/i, /obj/i, /ifc/i, /pdf/i]) expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /pdf/i }))

    await waitFor(() => expect(download).toHaveBeenCalledWith('p1', 'pdf'))
  })

  it('toolbar shows why an export failed', async () => {
    vi.spyOn(exportService, 'downloadExport').mockRejectedValue(new Error('The plan has no walls — nothing to export'))
    render(<MemoryRouter><StudioToolbar projectId="p1" /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /ifc/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nothing to export'))
  })
})
