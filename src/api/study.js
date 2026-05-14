import { http } from './http'

export function fetchTodayTask() {
  return http.get('/api/v1/study/tasks/today', { silentError: true })
}

export function fetchTaskItemCard(itemId) {
  return http.get(`/api/v1/study/task-items/${itemId}/card`)
}

export function submitTaskFeedback(itemId, payload) {
  return http.post(`/api/v1/study/task-items/${itemId}/feedback`, payload)
}

export function fetchPrimaryPlan() {
  return http.get('/api/v1/study/plans/primary', { silentError: true })
}

export function createStudyPlan(payload) {
  return http.post('/api/v1/study/plans', payload)
}

export function pauseStudyPlan(planId) {
  return http.post(`/api/v1/study/plans/${planId}/pause`)
}

export function resumeStudyPlan(planId) {
  return http.post(`/api/v1/study/plans/${planId}/resume`)
}

export function endStudyPlan(planId) {
  return http.post(`/api/v1/study/plans/${planId}/end`)
}

export function fetchStudyStatistics() {
  return http.get('/api/v1/study/statistics/overview')
}
