import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../src/stores/authStore'
import { apiClient } from '../src/services/api'

vi.mock('../src/services/api', () => ({
  apiClient: { post: vi.fn() }
}))

describe('authStore', () => {
  beforeEach(() => useAuthStore.setState({ accessToken: null, user: null }))

  it('login stores accessToken on success', async () => {
    (apiClient.post as any).mockResolvedValue({
      data: { accessToken: 'tok-123', refreshToken: 'ref-123', expiresIn: 1800 }
    })

    await useAuthStore.getState().login('a@b.com', 'pw')

    expect(useAuthStore.getState().accessToken).toBe('tok-123')
  })

  it('logout clears state', () => {
    useAuthStore.setState({ accessToken: 'tok', user: { email: 'a@b.com' } })
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })
})
