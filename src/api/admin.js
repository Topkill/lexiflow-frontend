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

export function fetchSystemConfigs(params = {}) {
  return http.get('/api/v1/admin/system-configs', { params })
}
