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

// Reads the identity claims the API puts in the access token (sub, role, email). Not a trust decision:
// the API authorizes every request itself; this only drives what the UI shows.
export function claimsFromToken(token: string): { sub?: string; role?: string; email?: string } {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')))
  } catch {
    return {}
  }
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
        const claims = claimsFromToken(data.accessToken)
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: { email, id: claims.sub, role: claims.role }
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
