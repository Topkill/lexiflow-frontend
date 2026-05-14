import { http } from './http'

export function fetchWordbooks(params = {}) {
  return http.get('/api/v1/wordbooks', { params })
}

export function fetchWordbookDetail(wordbookId) {
  return http.get(`/api/v1/wordbooks/${wordbookId}`)
}

export function fetchWordbookWords(wordbookId, params = {}) {
  return http.get(`/api/v1/wordbooks/${wordbookId}/words`, { params })
}
