import { http } from './http'

export function fetchNotes(params = {}) {
  return http.get('/api/v1/notes', { params })
}

export function fetchNote(noteId) {
  return http.get(`/api/v1/notes/${noteId}`)
}

export function createNote(payload) {
  return http.post('/api/v1/notes', payload)
}

export function updateNote(noteId, payload) {
  return http.put(`/api/v1/notes/${noteId}`, payload)
}

export function deleteNote(noteId) {
  return http.delete(`/api/v1/notes/${noteId}`)
}
