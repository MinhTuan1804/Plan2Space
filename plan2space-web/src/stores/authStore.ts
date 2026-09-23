import { create } from 'zustand'
import { apiClient } from '../services/api'

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

export const useAuthStore = create<AuthState>((set) => ({
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
}))
