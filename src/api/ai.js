import { http } from './http'

const TOKEN_KEY = 'lexiflow_access_token'
const CSRF_KEY = 'lexiflow_csrf_token'

export function askWordQuestion(wordId, payload, config = {}) {
  return http.post(`/api/v1/ai/words/${wordId}/questions`, payload, config)
}

export async function streamWordQuestion(wordId, payload, handlers = {}) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || ''
  const token = localStorage.getItem(TOKEN_KEY)
  const csrfToken = localStorage.getItem(CSRF_KEY)
  const headers = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken

  const response = await fetch(`${baseUrl}/api/v1/ai/words/${wordId}/questions/stream`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(payload),
    signal: handlers.signal,
  })

  if (!response.ok || !response.body) {
    throw await parseStreamHttpError(response)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let donePayload = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, '\n')
    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      const parsed = parseSseEvent(rawEvent)
      if (parsed) {
        const payloadData = parsed.data ? JSON.parse(parsed.data) : null
        if (parsed.event === 'status') handlers.onStatus?.(payloadData)
        if (parsed.event === 'chunk') handlers.onChunk?.(payloadData?.text || '')
        if (parsed.event === 'done') {
          donePayload = payloadData
          handlers.onDone?.(payloadData)
        }
        if (parsed.event === 'error') {
          const error = new Error(payloadData?.message || 'AI 问答暂时不可用，请稍后重试。')
          error.code = payloadData?.code
          handlers.onError?.(error)
          throw error
        }
      }
      separatorIndex = buffer.indexOf('\n\n')
    }
  }

  const tail = buffer.replace(/\r\n/g, '\n').trim()
  if (tail) {
    const parsed = parseSseEvent(tail)
    if (parsed?.event === 'done') {
      donePayload = parsed.data ? JSON.parse(parsed.data) : null
      handlers.onDone?.(donePayload)
    }
  }
  return donePayload
}

async function parseStreamHttpError(response) {
  const fallback = new Error('AI 问答暂时不可用，请稍后重试。')
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await response.json()
      const error = new Error(body?.message || fallback.message)
      error.code = body?.code
      error.status = response.status
      return error
    }
    const text = await response.text()
    if (text) {
      try {
        const body = JSON.parse(text)
        const error = new Error(body?.message || fallback.message)
        error.code = body?.code
        error.status = response.status
        return error
      } catch {
        const error = new Error(text || fallback.message)
        error.status = response.status
        return error
      }
    }
  } catch {
    // ignore and use fallback
  }
  fallback.status = response.status
  return fallback
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split(/\r?\n/)
  let event = 'message'
  const dataLines = []
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''))
    }
  }
  if (!event && dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
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

export function fetchClozeAttemptAiReview(attemptId) {
  return http.get(`/api/v1/quizzes/cloze/attempts/${attemptId}/ai-review`)
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
