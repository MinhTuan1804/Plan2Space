import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequireAuth } from '../src/components/RequireAuth'
import { useAuthStore } from '../src/stores/authStore'

describe('RequireAuth', () => {
  it('redirects to /auth when not authenticated', () => {
    useAuthStore.setState({ accessToken: null, user: null })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/auth" element={<div>Auth Page</div>} />
          <Route path="/dashboard" element={<RequireAuth><div>Dashboard</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Auth Page')).toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    useAuthStore.setState({ accessToken: 'tok', user: { email: 'a@b.com' } })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<RequireAuth><div>Dashboard</div></RequireAuth>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
