import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../src/pages/DashboardPage'
import * as projectsService from '../src/services/projectsService'

vi.mock('../src/services/projectsService')

describe('DashboardPage', () => {
  it('lists projects returned by the API', async () => {
    vi.mocked(projectsService.listProjects).mockResolvedValue([
      { id: '1', name: 'House A', createdAt: '', updatedAt: '' }
    ])
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('House A')).toBeInTheDocument())
  })

  it('creates a project on form submit', async () => {
    vi.mocked(projectsService.listProjects).mockResolvedValue([])
    vi.mocked(projectsService.createProject).mockResolvedValue({ id: '2', name: 'New', createdAt: '', updatedAt: '' })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)

    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'New' } })
    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(projectsService.createProject).toHaveBeenCalledWith('New'))
  })
})
