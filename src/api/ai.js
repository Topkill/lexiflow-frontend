import { http } from './http'

export function generateWordExplanation(wordId, wordbookId, regenerate = false) {
  return http.post(`/api/v1/ai/words/${wordId}/explanation`, null, { params: { wordbookId, regenerate } })
}

export function generateWordExamples(wordId, wordbookId, regenerate = false) {
  return http.post(`/api/v1/ai/words/${wordId}/examples`, null, { params: { wordbookId, regenerate } })
}

export function generateWordMnemonic(wordId, wordbookId, regenerate = false) {
  return http.post(`/api/v1/ai/words/${wordId}/mnemonic`, null, { params: { wordbookId, regenerate } })
}

export function createClozeTask(payload) {
  return http.post('/api/v1/ai/cloze-tasks', payload)
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
