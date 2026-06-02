import { http } from './http'

export function login(payload, config = {}) {
  return http.post('/api/v1/auth/login', payload, config)
}

export function fetchLoginCaptcha(config = {}) {
  return http.get('/api/v1/auth/login-captcha', config)
}

export function register(payload) {
  return http.post('/api/v1/auth/register', payload)
}

export function refreshToken(config = {}) {
  return http.post('/api/v1/auth/refresh', null, config)
}

export function logout(config = {}) {
  return http.post('/api/v1/auth/logout', null, config)
}

export function fetchCurrentUser(config = {}) {
  return http.get('/api/v1/auth/me', config)
}
