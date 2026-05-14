import { http } from './http'

export function fetchDueWords(params = {}) {
  return http.get('/api/v1/review/due-words', { params })
}

export function fetchWrongWords(params = {}) {
  return http.get('/api/v1/review/wrong-words', { params })
}

export function fetchFavoriteWords(params = {}) {
  return http.get('/api/v1/review/favorite-words', { params })
}

export function resolveWrongWord(wrongWordId) {
  return http.post(`/api/v1/review/wrong-words/${wrongWordId}/resolve`)
}

export function favoriteWord(payload) {
  return http.post('/api/v1/review/favorite-words', payload)
}

export function deleteFavoriteWord(favoriteWordId) {
  return http.delete(`/api/v1/review/favorite-words/${favoriteWordId}`)
}
