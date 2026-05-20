import { http } from './http'

export function askWordQuestion(wordId, payload, config = {}) {
  return http.post(`/api/v1/ai/words/${wordId}/questions`, payload, config)
}

export function createClozeTask(payload, config = {}) {
  return http.post('/api/v1/ai/cloze-tasks', payload, { timeout: 120000, ...config })
}

export function fetchClozeQuiz(quizId) {
  return http.get(`/api/v1/quizzes/cloze/${quizId}`)
}

export function submitClozeAttempt(quizId, payload) {
  return http.post(`/api/v1/quizzes/cloze/${quizId}/attempts`, payload)
}

export function createReportTask(payload) {
  return http.post('/api/v1/ai/report-tasks', payload)
}

export function fetchReports(params = {}) {
  return http.get('/api/v1/reports', { params })
}

export function fetchReport(reportId) {
  return http.get(`/api/v1/reports/${reportId}`)
}
