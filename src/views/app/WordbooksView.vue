<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Calendar, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchWordbooks } from '../../api/wordbook'

const router = useRouter()
const loading = ref(false)
const wordbooks = ref([])

async function loadWordbooks() {
  loading.value = true
  try {
    wordbooks.value = await fetchWordbooks()
  } finally {
    loading.value = false
  }
}

onMounted(loadWordbooks)
</script>

<template>
  <section>
    <PageHeader title="词库" subtitle="选择 CET4、CET6 或考研英语词库开始学习">
      <el-button :icon="Refresh" @click="loadWordbooks">刷新</el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="5" animated />
    <EmptyState v-else-if="wordbooks.length === 0" title="暂无可用词库" />

    <div v-else class="wordbook-grid">
      <el-card v-for="book in wordbooks" :key="book.id" class="wordbook-card" shadow="never">
        <div class="wordbook-topline">
          <el-tag>{{ book.type }}</el-tag>
          <span>{{ book.wordCount || 0 }} 词</span>
        </div>
        <h2>{{ book.name }}</h2>
        <p>{{ book.description || '系统内置考试词库' }}</p>
        <div class="wordbook-meta">
          <span>难度 {{ book.difficultyLevel }}</span>
          <span>进度 {{ book.progress?.learnedCount ?? 0 }}/{{ book.wordCount || 0 }}</span>
        </div>
        <el-button type="primary" :icon="Calendar" @click="router.push({ path: '/app/plans', query: { wordbookId: book.id } })">
          制定计划
        </el-button>
      </el-card>
    </div>
  </section>
</template>
