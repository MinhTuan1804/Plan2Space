import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError } from 'axios'
import { apiClient } from '../src/services/api'
import { useAuthStore, AUTH_STORAGE_KEY } from '../src/stores/authStore'
import DashboardPage from '../src/pages/DashboardPage'
import * as projectsService from '../src/services/projectsService'

describe('auth session', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ accessToken: null, refreshToken: null, user: null })
  })

  it('keeps the session across a page reload', async () => {
    useAuthStore.setState({ accessToken: 'tok-1', user: { email: 'a@b.com' } })
    const saved = localStorage.getItem(AUTH_STORAGE_KEY)
    expect(saved).toContain('tok-1')

    // Simulate a fresh page: in-memory state gone, browser storage still holds the session.
    useAuthStore.setState({ accessToken: null, user: null })
    localStorage.setItem(AUTH_STORAGE_KEY, saved!)
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().accessToken).toBe('tok-1')
  })

  it('logs out when the API rejects the token (expired session)', async () => {
    useAuthStore.setState({ accessToken: 'expired' })
    const original = apiClient.defaults.adapter
    apiClient.defaults.adapter = async (config) => {
      const response = { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config }
      throw new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, null, response as any)
    }
    try {
      await expect(apiClient.get('/projects')).rejects.toBeTruthy()
    } finally {
      apiClient.defaults.adapter = original
    }
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('dashboard shows an error instead of an empty list when loading fails', async () => {
    vi.spyOn(projectsService, 'listProjects').mockRejectedValue({ response: { status: 500 } })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/could not load projects/i))
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
  })
})
