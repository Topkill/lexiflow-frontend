import { defineStore } from 'pinia'
import * as authApi from '../api/auth'

const TOKEN_KEY = 'lexiflow_access_token'
const CSRF_KEY = 'lexiflow_csrf_token'
const USER_KEY = 'lexiflow_user'

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: localStorage.getItem(TOKEN_KEY),
    csrfToken: localStorage.getItem(CSRF_KEY),
    user: readUser(),
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.accessToken && state.user),
    isAdmin: (state) => state.user?.role === 'ADMIN',
    displayName: (state) => state.user?.nickname || state.user?.email || 'LexiFlow 用户',
  },
  actions: {
    setSession(session) {
      this.accessToken = session.accessToken
      this.csrfToken = session.csrfToken
      this.user = session.user
      localStorage.setItem(TOKEN_KEY, session.accessToken)
      localStorage.setItem(CSRF_KEY, session.csrfToken || '')
      localStorage.setItem(USER_KEY, JSON.stringify(session.user))
    },
    setUser(user) {
      this.user = user
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    },
    clearSession() {
      this.accessToken = null
      this.csrfToken = null
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(CSRF_KEY)
      localStorage.removeItem(USER_KEY)
    },
    async login(payload) {
      const session = await authApi.login(payload)
      this.setSession(session)
      return session
    },
    async register(payload) {
      return authApi.register(payload)
    },
    async refresh() {
      const session = await authApi.refreshToken()
      this.setSession(session)
      return session
    },
    async fetchMe() {
      const user = await authApi.fetchCurrentUser()
      this.setUser(user)
      return user
    },
    async bootstrap() {
      if (this.initialized) {
        return
      }
      try {
        if (this.accessToken) {
          await this.fetchMe()
        } else {
          await this.refresh()
        }
      } catch {
        this.clearSession()
      } finally {
        this.initialized = true
      }
    },
    async logout() {
      try {
        await authApi.logout()
      } finally {
        this.clearSession()
      }
    },
  },
})
