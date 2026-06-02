export const SESSION_EXPIRED_EVENT = 'lexiflow:session-expired'
export const SESSION_EXPIRED_REASON = 'session_expired'

export function notifySessionExpired() {
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
  }, 0)
}
