<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Memo, SwitchButton, User } from '@element-plus/icons-vue'
import LexiIcon from '../components/LexiIcon.vue'
import StudyNoteDialog from '../components/StudyNoteDialog.vue'
import { createNote } from '../api/notes'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const quickNoteVisible = ref(false)
const quickNoteSaving = ref(false)
const quickNoteDraft = ref({
  sourceType: 'NORMAL',
  title: '',
  quotedText: '',
  contentMd: '',
})

const menuItems = [
  { path: '/app', label: '今日学习', icon: 'home' },
  { path: '/app/wordbooks', label: '词库', icon: 'book' },
  { path: '/app/plans', label: '计划', icon: 'calendar' },
  { path: '/app/study', label: '学习', icon: 'study' },
  { path: '/app/review', label: '复习', icon: 'review' },
  { path: '/app/cloze', label: '完形填空', icon: 'cloze' },
  { path: '/app/reports', label: '报告', icon: 'report' },
  { path: '/app/wrong-words', label: '错词', icon: 'warning' },
  { path: '/app/favorites', label: '收藏', icon: 'star' },
  { path: '/app/notes', label: '笔记', icon: 'note' },
  { path: '/app/statistics', label: '统计', icon: 'chart' },
  { path: '/app/settings', label: '设置', icon: 'settings' },
  { path: '/app/ai-config', label: 'AI 配置', icon: 'ai' },
]

const activeMenu = computed(() => {
  const matched = [...menuItems].reverse().find((item) => route.path === item.path || route.path.startsWith(`${item.path}/`))
  return matched?.path || '/app'
})

function openQuickNote() {
  quickNoteDraft.value = {
    sourceType: 'NORMAL',
    title: '',
    quotedText: '',
    contentMd: '',
  }
  quickNoteVisible.value = true
}

async function saveQuickNote(payload) {
  if (quickNoteSaving.value) return
  quickNoteSaving.value = true
  try {
    await createNote({
      sourceType: 'NORMAL',
      sourceId: null,
      wordbookId: null,
      wordId: null,
      title: payload.title,
      quotedText: payload.quotedText,
      contentMd: payload.contentMd,
    })
    ElMessage.success('笔记已创建')
    quickNoteVisible.value = false
  } finally {
    quickNoteSaving.value = false
  }
}

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
          <LexiIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </aside>

    <section class="app-main">
      <header class="topbar">
        <div class="topbar-heading">
          <div class="topbar-title">{{ route.meta.title || 'LexiFlow' }}</div>
          <div class="topbar-date">{{ new Date().toLocaleDateString('zh-CN') }}</div>
        </div>
        <div class="topbar-actions">
          <el-tooltip content="记笔记" placement="bottom" effect="light">
            <el-button class="quick-note-button" :icon="Memo" @click="openQuickNote">
              <span class="quick-note-label">记笔记</span>
            </el-button>
          </el-tooltip>
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
        <RouterLink v-for="item in menuItems" :key="item.path" :to="item.path">
          <LexiIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <main class="content-wrap">
        <RouterView />
      </main>
    </section>

    <StudyNoteDialog
      v-model="quickNoteVisible"
      title="新建笔记"
      confirm-text="创建笔记"
      :initial-note="quickNoteDraft"
      :saving="quickNoteSaving"
      @submit="saveQuickNote"
    />
  </div>
</template>
