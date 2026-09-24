import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

export const apiClient = axios.create({ baseURL: '/api' })

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// An expired/invalid token must end the session (RequireAuth then redirects to /auth)
// instead of every page silently failing its requests.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error?.config?.url?.startsWith('/auth/')
    if (error?.response?.status === 401 && !isLogin) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)
