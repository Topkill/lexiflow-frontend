import { http } from './http'

export function login(payload) {
  return http.post('/api/v1/auth/login', payload)
}

export function register(payload) {
  return http.post('/api/v1/auth/register', payload)
}

export function refreshToken() {
  return http.post('/api/v1/auth/refresh')
}

export function logout() {
  return http.post('/api/v1/auth/logout')
}

export function fetchCurrentUser() {
  return http.get('/api/v1/auth/me')
}
