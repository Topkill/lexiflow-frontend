import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  { path: '/', redirect: '/app' },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/auth/RegisterView.vue'),
    meta: { public: true },
  },
  {
    path: '/app',
    component: () => import('../layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'dashboard', component: () => import('../views/app/DashboardView.vue') },
      { path: 'wordbooks', name: 'wordbooks', component: () => import('../views/app/WordbooksView.vue') },
      { path: 'plans', name: 'plans', component: () => import('../views/app/StudyPlanView.vue') },
      { path: 'study', name: 'study', component: () => import('../views/app/StudyCardView.vue') },
      { path: 'review', name: 'review', component: () => import('../views/app/ReviewView.vue') },
      { path: 'cloze', name: 'cloze', component: () => import('../views/app/ClozeQuizView.vue') },
      { path: 'reports', name: 'reports', component: () => import('../views/app/StudyReportView.vue') },
      { path: 'wrong-words', name: 'wrongWords', component: () => import('../views/app/WrongWordsView.vue') },
      { path: 'favorites', name: 'favorites', component: () => import('../views/app/FavoriteWordsView.vue') },
      { path: 'statistics', name: 'statistics', component: () => import('../views/app/StatisticsView.vue') },
      { path: 'settings', name: 'settings', component: () => import('../views/app/SettingsView.vue') },
      { path: 'ai-config', name: 'aiConfig', component: () => import('../views/app/AiConfigView.vue') },
    ],
  },
  {
    path: '/admin',
    component: () => import('../layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'adminDashboard', component: () => import('../views/admin/AdminDashboardView.vue') },
      { path: 'users', name: 'adminUsers', component: () => import('../views/admin/AdminUsersView.vue') },
      { path: 'wordbooks', name: 'adminWordbooks', component: () => import('../views/admin/AdminWordbooksView.vue') },
      { path: 'words', name: 'adminWords', component: () => import('../views/admin/AdminWordsView.vue') },
      { path: 'imports', name: 'adminImports', component: () => import('../views/admin/AdminImportView.vue') },
      { path: 'ai-configs', name: 'adminAiConfigs', component: () => import('../views/admin/AdminAiConfigView.vue') },
      { path: 'ai-logs', name: 'adminAiLogs', component: () => import('../views/admin/AdminAiLogsView.vue') },
      { path: 'system-configs', name: 'adminSystemConfigs', component: () => import('../views/admin/AdminSystemConfigView.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'notFound', component: () => import('../views/NotFoundView.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()

  if (to.meta.public && auth.isAuthenticated) {
    return auth.isAdmin ? '/admin' : '/app'
  }
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return '/app'
  }
  return true
})

export default router
