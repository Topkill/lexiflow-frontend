import axios from 'axios'
import { ElMessage } from 'element-plus'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 20000,
  withCredentials: true,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('lexiflow_access_token')
  const csrfToken = localStorage.getItem('lexiflow_csrf_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (csrfToken && ['post', 'put', 'patch', 'delete'].includes(config.method)) {
    config.headers['X-CSRF-Token'] = csrfToken
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      const error = new Error(body.message || '请求失败')
      error.code = body.code
      error.response = response
      throw error
    }
    return body?.data ?? body
  },
  (error) => {
    if (error.response?.data?.code) {
      error.code = error.response.data.code
    }
    const message = error.response?.data?.message || error.message || '网络请求失败'
    if (!error.config?.silentError && error.response?.status !== 401) {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  },
)
