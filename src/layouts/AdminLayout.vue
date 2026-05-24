<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Collection,
  Cpu,
  DataAnalysis,
  Grid,
  House,
  Operation,
  Setting,
  SwitchButton,
  Tickets,
  Upload,
  User,
} from '@element-plus/icons-vue'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const adminMenu = [
  { path: '/admin', label: '数据看板', icon: House },
  { path: '/admin/users', label: '用户管理', icon: User },
  { path: '/admin/wordbooks', label: '词库管理', icon: Collection },
  { path: '/admin/words', label: '单词管理', icon: Tickets },
  { path: '/admin/imports', label: '单词导入', icon: Upload },
  { path: '/admin/ai-configs', label: 'AI 配置', icon: Cpu },
  { path: '/admin/ai-prompts', label: 'AI 提示词', icon: Operation },
  { path: '/admin/ai-logs', label: 'AI 日志', icon: DataAnalysis },
  { path: '/admin/system-configs', label: '系统配置', icon: Setting },
]

const activeMenu = computed(() => {
  const matched = [...adminMenu].reverse().find((item) => route.path === item.path || route.path.startsWith(`${item.path}/`))
  return matched?.path || '/admin'
})

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <div class="brand-row compact">
        <div class="brand-mark">L</div>
        <div>
          <div class="brand-name">LexiFlow</div>
          <div class="brand-subtitle">Admin</div>
        </div>
      </div>
      <el-menu :default-active="activeMenu" router class="side-menu admin-menu">
        <el-menu-item v-for="item in adminMenu" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <section class="admin-main">
      <header class="topbar admin-topbar">
        <div>
          <div class="topbar-title">{{ route.meta.title || '运营后台' }}</div>
          <div class="topbar-date">{{ auth.user?.email }}</div>
        </div>
        <div class="topbar-actions">
          <el-button text @click="router.push('/app')">
            <el-icon><Grid /></el-icon>
            用户端
          </el-button>
          <el-button @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            退出
          </el-button>
        </div>
      </header>

      <nav class="mobile-nav admin-mobile-nav">
        <RouterLink v-for="item in adminMenu" :key="item.path" :to="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <main class="content-wrap admin-content">
        <RouterView />
      </main>
    </section>
  </div>
</template>
