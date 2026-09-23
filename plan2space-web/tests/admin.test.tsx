import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { apiClient } from '../src/services/api'
import { useAuthStore } from '../src/stores/authStore'
import AdminPage from '../src/pages/AdminPage'
import DashboardPage from '../src/pages/DashboardPage'
import * as projectsService from '../src/services/projectsService'

// A JWT with payload {"sub":"u1","role":"Admin","email":"a@b.dev"} (signature irrelevant client-side).
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const ADMIN_TOKEN = `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'u1', role: 'Admin', email: 'a@b.dev' })}.sig`

describe('admin', () => {
  afterEach(() => { vi.restoreAllMocks(); useAuthStore.setState({ accessToken: null, user: null }) })

  it('login reads the user id and role from the access token', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { accessToken: ADMIN_TOKEN, refreshToken: 'r', expiresIn: 1800 } })
    await useAuthStore.getState().login('a@b.dev', 'pw')
    expect(useAuthStore.getState().user).toMatchObject({ id: 'u1', role: 'Admin', email: 'a@b.dev' })
  })

  it('admin page lists users, projects and jobs', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => ({
      data: url.endsWith('/users') ? [{ id: 'u1', email: 'owner@x.dev', role: 'StandardUser', projectCount: 2, createdAt: '2026-09-01' }]
        : url.endsWith('/projects') ? [{ id: 'p1', name: 'Nha Mau', ownerEmail: 'owner@x.dev', updatedAt: '2026-09-02' }]
        : [{ id: 'j1', projectId: 'p1', status: 'Failed', progressPercent: 30, error: 'No walls found', createdAt: '2026-09-03' }]
    }))
    render(<MemoryRouter><AdminPage /></MemoryRouter>)

    await waitFor(() => expect(screen.getByText('Nha Mau')).toBeInTheDocument())
    expect(screen.getAllByText('owner@x.dev').length).toBeGreaterThan(0)
    expect(screen.getByText('No walls found')).toBeInTheDocument()
  })

  it('admin page explains when the user is not an admin', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue({ response: { status: 403 } })
    render(<MemoryRouter><AdminPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/admins only/i))
  })

  it('dashboard links to the admin page only for admins', async () => {
    vi.spyOn(projectsService, 'listProjects').mockResolvedValue([])
    useAuthStore.setState({ accessToken: 't', user: { email: 'u@x.dev', role: 'StandardUser' } })
    const { unmount } = render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('No projects yet')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
    unmount()

    useAuthStore.setState({ accessToken: 't', user: { email: 'a@x.dev', role: 'Admin' } })
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: /admin/i })).toHaveAttribute('href', '/admin')
  })
})
