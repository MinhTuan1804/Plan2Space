import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apiClient } from '../services/api'

export const AUTH_STORAGE_KEY = 'p2s-auth'

export interface AuthUser {
  id?: string
  email: string
  role?: string
}

export interface AuthState {
  accessToken: string | null
  refreshToken?: string | null
  user: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  setToken?: (token: string | null, user?: AuthUser | null) => void
}

// The session survives a page reload; an expired token is cleared by the 401 interceptor in services/api.ts.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      login: async (email, password) => {
        const { data } = await apiClient.post('/auth/login', { email, password })
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: { email, id: data.userId, role: data.role }
        })
      },
      register: async (email, password) => {
        await apiClient.post('/auth/register', { email, password })
      },
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
      setToken: (token, user = null) => set({ accessToken: token, user })
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user })
    }
  )
)
