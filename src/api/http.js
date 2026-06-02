import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import { notifySessionExpired } from '../utils/sessionEvents'

const TOKEN_KEY = 'lexiflow_access_token'
const CSRF_KEY = 'lexiflow_csrf_token'
const USER_KEY = 'lexiflow_user'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 20000,
  withCredentials: true,
})

let refreshPromise = null

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  const csrfToken = localStorage.getItem(CSRF_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method)) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

function saveSession(session) {
  localStorage.setItem(TOKEN_KEY, session.accessToken)
  localStorage.setItem(CSRF_KEY, session.csrfToken || '')
  localStorage.setItem(USER_KEY, JSON.stringify(session.user))
  try {
    useAuthStore().setSession(session)
  } catch {
    // Pinia may not be ready during early module initialization; localStorage remains the source for requests.
  }
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(CSRF_KEY)
  localStorage.removeItem(USER_KEY)
  try {
    useAuthStore().clearSession()
  } catch {
    // Ignore store access before app bootstrap.
  }
}

export async function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = http.post('/api/v1/auth/refresh', null, { skipAuthRefresh: true, silentError: true })
      .then((session) => {
        saveSession(session)
        return session
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

http.interceptors.response.use(
  (response) => {
    if (response.config.responseType === 'blob') {
      return response
    }
    const body = response.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      const error = new Error(body.message || '请求失败')
      error.code = body.code
      error.response = response
      throw error
    }
    return body?.data ?? body
  },
  async (error) => {
    if (error.response?.data?.code) {
      error.code = error.response.data.code
    }
    const originalConfig = error.config
    if (error.response?.status === 401 && originalConfig && !originalConfig._retry && !originalConfig.skipAuthRefresh) {
      originalConfig._retry = true
      try {
        const session = await refreshAuthSession()
        originalConfig.headers = originalConfig.headers || {}
        originalConfig.headers.Authorization = `Bearer ${session.accessToken}`
        if (session.csrfToken && ['post', 'put', 'patch', 'delete'].includes(originalConfig.method)) {
          originalConfig.headers['X-CSRF-Token'] = session.csrfToken
        }
        return http(originalConfig)
      } catch (refreshError) {
        clearSession()
        notifySessionExpired()
        if (!originalConfig.silentError) {
          ElMessage.error('登录已过期，请重新登录')
        }
        return Promise.reject(refreshError)
      }
    }
    const message = error.response?.data?.message || error.message || '网络请求失败'
    if (!error.config?.silentError && error.response?.status !== 401) {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  },
)
