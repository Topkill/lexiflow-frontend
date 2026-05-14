import { http } from './http'

export function fetchAdminOverview() {
  return http.get('/api/v1/admin/dashboard/overview')
}

export function fetchAdminUsers(params = {}) {
  return http.get('/api/v1/admin/users', { params })
}

export function fetchAdminWordbooks(params = {}) {
  return http.get('/api/v1/admin/wordbooks', { params })
}

export function fetchAdminAiLogs(params = {}) {
  return http.get('/api/v1/admin/ai/call-logs', { params })
}

export function fetchAdminAiPublicConfigs() {
  return http.get('/api/v1/admin/ai/public-configs')
}

export function createAdminAiPublicConfig(payload) {
  return http.post('/api/v1/admin/ai/public-configs', payload)
}

export function updateAdminAiPublicConfig(configId, payload) {
  return http.put(`/api/v1/admin/ai/public-configs/${configId}`, payload)
}

export function activateAdminAiPublicConfig(configId) {
  return http.post(`/api/v1/admin/ai/public-configs/${configId}/activate`)
}

export function disableAdminAiPublicConfig(configId) {
  return http.post(`/api/v1/admin/ai/public-configs/${configId}/disable`)
}

export function fetchSystemConfigs(params = {}) {
  return http.get('/api/v1/admin/system-configs', { params })
}
