import { http } from './http'

export function fetchAdminOverview() {
  return http.get('/api/v1/admin/dashboard/overview')
}

export function fetchAdminUsers(params = {}) {
  return http.get('/api/v1/admin/users', { params })
}

export function fetchAdminUserDetail(userId) {
  return http.get(`/api/v1/admin/users/${userId}`)
}

export function enableAdminUser(userId) {
  return http.post(`/api/v1/admin/users/${userId}/enable`)
}

export function disableAdminUser(userId) {
  return http.post(`/api/v1/admin/users/${userId}/disable`)
}

export function fetchAdminWordbooks(params = {}) {
  return http.get('/api/v1/admin/wordbooks', { params })
}

export function createAdminWordbook(payload) {
  return http.post('/api/v1/admin/wordbooks', payload)
}

export function updateAdminWordbook(wordbookId, payload) {
  return http.put(`/api/v1/admin/wordbooks/${wordbookId}`, payload)
}

export function enableAdminWordbook(wordbookId) {
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/enable`)
}

export function disableAdminWordbook(wordbookId) {
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/disable`)
}

export function fetchAdminWords(wordbookId, params = {}) {
  return http.get(`/api/v1/admin/wordbooks/${wordbookId}/words`, { params })
}

export function createAdminWord(wordbookId, payload) {
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/words`, payload)
}

export function updateAdminWord(wordbookId, wordId, payload) {
  return http.put(`/api/v1/admin/wordbooks/${wordbookId}/words/${wordId}`, payload)
}

export function enableAdminWord(wordbookId, wordId) {
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/words/${wordId}/enable`)
}

export function disableAdminWord(wordbookId, wordId) {
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/words/${wordId}/disable`)
}

export function removeAdminWord(wordbookId, wordId) {
  return http.delete(`/api/v1/admin/wordbooks/${wordbookId}/words/${wordId}`)
}

export function downloadWordImportTemplate() {
  return http.get('/api/v1/admin/imports/word-template', { responseType: 'blob' })
}

export function importAdminWords(wordbookId, duplicateStrategy, file) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/imports`, formData, {
    params: { duplicateStrategy },
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
}

export function importAdminWordsFromJsonUrl(wordbookId, payload) {
  return http.post(`/api/v1/admin/wordbooks/${wordbookId}/imports/json-url`, payload, { timeout: 120000 })
}

export function fetchWordImportTask(importTaskId) {
  return http.get(`/api/v1/admin/imports/${importTaskId}`)
}

export function fetchWordImportErrors(importTaskId, params = {}) {
  return http.get(`/api/v1/admin/imports/${importTaskId}/errors`, { params })
}

export function downloadWordImportErrorReport(importTaskId) {
  return http.get(`/api/v1/admin/imports/${importTaskId}/error-report`, { responseType: 'blob' })
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

export function enableAdminAiPublicConfig(configId) {
  return http.post(`/api/v1/admin/ai/public-configs/${configId}/enable`)
}

export function disableAdminAiPublicConfig(configId) {
  return http.post(`/api/v1/admin/ai/public-configs/${configId}/disable`)
}

export function fetchAdminAiPromptGroups() {
  return http.get('/api/v1/admin/ai/prompt-templates')
}

export function createAdminAiPromptTemplate(payload) {
  return http.post('/api/v1/admin/ai/prompt-templates', payload)
}

export function updateAdminAiPromptTemplate(templateId, payload) {
  return http.put(`/api/v1/admin/ai/prompt-templates/${templateId}`, payload)
}

export function copyAdminAiPromptTemplate(templateId) {
  return http.post(`/api/v1/admin/ai/prompt-templates/${templateId}/copy`)
}

export function copyBuiltinAdminAiPromptTemplate(featureType) {
  return http.post(`/api/v1/admin/ai/prompt-templates/builtin/${featureType}/copy`)
}

export function bindAdminAiPromptFeature(featureType, payload) {
  return http.put(`/api/v1/admin/ai/prompt-features/${featureType}/binding`, payload)
}

export function fetchSystemConfigs(params = {}) {
  return http.get('/api/v1/admin/system-configs', { params })
}

export function createSystemConfig(payload) {
  return http.post('/api/v1/admin/system-configs', payload)
}

export function updateSystemConfig(configId, payload) {
  return http.put(`/api/v1/admin/system-configs/${configId}`, payload)
}

export function deleteSystemConfig(configId) {
  return http.delete(`/api/v1/admin/system-configs/${configId}`)
}
