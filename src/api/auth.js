import { http } from './http'

export function login(payload) {
  return http.post('/api/v1/auth/login', payload)
}

export function register(payload) {
  return http.post('/api/v1/auth/register', payload)
}

export function refreshToken(config = {}) {
  return http.post('/api/v1/auth/refresh', null, config)
}

export function logout() {
  return http.post('/api/v1/auth/logout')
}

export function fetchCurrentUser(config = {}) {
  return http.get('/api/v1/auth/me', config)
}
