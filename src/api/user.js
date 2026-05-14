import { http } from './http'

export function fetchProfile() {
  return http.get('/api/v1/users/me/profile')
}

export function updateProfile(payload) {
  return http.put('/api/v1/users/me/profile', payload)
}

export function fetchUserSettings() {
  return http.get('/api/v1/users/me/settings')
}

export function updateUserSettings(payload) {
  return http.put('/api/v1/users/me/settings', payload)
}

export function fetchUserAiConfig() {
  return http.get('/api/v1/users/me/ai-config')
}

export function saveUserAiConfig(payload) {
  return http.put('/api/v1/users/me/ai-config', payload)
}
