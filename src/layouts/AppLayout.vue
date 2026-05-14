<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Calendar,
  Collection,
  Connection,
  DataAnalysis,
  Document,
  House,
  Reading,
  Refresh,
  Setting,
  Star,
  SwitchButton,
  User,
  Warning,
} from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const menuItems = [
  { path: '/app', label: '今日任务', icon: House },
  { path: '/app/wordbooks', label: '词库', icon: Collection },
  { path: '/app/plans', label: '计划', icon: Calendar },
  { path: '/app/study', label: '学习', icon: Reading },
  { path: '/app/review', label: '复习', icon: Refresh },
  { path: '/app/cloze', label: '完形填空', icon: Document },
  { path: '/app/reports', label: '报告', icon: DataAnalysis },
  { path: '/app/wrong-words', label: '错词', icon: Warning },
  { path: '/app/favorites', label: '收藏', icon: Star },
  { path: '/app/statistics', label: '统计', icon: DataAnalysis },
  { path: '/app/settings', label: '设置', icon: Setting },
  { path: '/app/ai-config', label: 'AI 配置', icon: Connection },
]

const activeMenu = computed(() => {
  const matched = [...menuItems].reverse().find((item) => route.path === item.path || route.path.startsWith(`${item.path}/`))
  return matched?.path || '/app'
})

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="app-shell">
    <aside class="app-sidebar">
      <div class="brand-row">
        <div class="brand-mark">L</div>
        <div>
          <div class="brand-name">LexiFlow</div>
          <div class="brand-subtitle">AI Vocabulary</div>
        </div>
      </div>

      <el-menu :default-active="activeMenu" router class="side-menu">
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <section class="app-main">
      <header class="topbar">
        <div>
          <div class="topbar-title">{{ route.meta.title || 'LexiFlow' }}</div>
          <div class="topbar-date">{{ new Date().toLocaleDateString('zh-CN') }}</div>
        </div>
        <div class="topbar-actions">
          <el-button v-if="auth.isAdmin" text @click="router.push('/admin')">后台</el-button>
          <el-dropdown trigger="click">
            <el-button class="user-button">
              <el-icon><User /></el-icon>
              <span>{{ auth.displayName }}</span>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/app/settings')">个人设置</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <nav class="mobile-nav">
        <RouterLink v-for="item in menuItems.slice(0, 8)" :key="item.path" :to="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <main class="content-wrap">
        <RouterView />
      </main>
    </section>
  </div>
</template>
