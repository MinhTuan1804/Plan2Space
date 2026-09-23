import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { apiClient } from '../src/services/api'
import { useGeometryStore } from '../src/stores/geometryStore'
import { CopilotChat } from '../src/components/studio/Copilot/CopilotChat'

function type(message: string) {
  const input = screen.getByPlaceholderText(/tell the co-pilot/i)
  fireEvent.change(input, { target: { value: message } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('CopilotChat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends the message, shows the reply and reloads geometry when an edit was applied', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { action: 'move_wall', params: {}, appliedVersion: 4, message: 'Moved the wall by (0.5 m, 0 m).' }
    })
    const loadFromServer = vi.fn().mockResolvedValue(undefined)
    useGeometryStore.setState({ loadFromServer })

    render(<CopilotChat projectId="p1" />)
    type('move the left wall 50cm right')

    await waitFor(() => expect(screen.getByText('Moved the wall by (0.5 m, 0 m).')).toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/copilot/message', expect.objectContaining({ projectId: 'p1', message: 'move the left wall 50cm right' }))
    expect(screen.getByText('move the left wall 50cm right')).toBeInTheDocument()
    expect(loadFromServer).toHaveBeenCalledWith('p1')
  })

  it('does not reload when nothing was applied', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { action: 'unknown', params: {}, appliedVersion: null, message: 'Try something else' } })
    const loadFromServer = vi.fn()
    useGeometryStore.setState({ loadFromServer })

    render(<CopilotChat projectId="p1" />)
    type('make it nicer')

    await waitFor(() => expect(screen.getByText('Try something else')).toBeInTheDocument())
    expect(loadFromServer).not.toHaveBeenCalled()
  })

  it('shows the API reason when the edit is rejected', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue({ response: { status: 422, data: { message: "The co-pilot referred to a wall that doesn't exist in this plan." } } })

    render(<CopilotChat projectId="p1" />)
    type('move that wall')

    await waitFor(() => expect(screen.getByText(/doesn't exist in this plan/)).toBeInTheDocument())
  })
})
