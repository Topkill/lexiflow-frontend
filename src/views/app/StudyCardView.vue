<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchTaskItemCard, fetchTodayTask, submitTaskFeedback } from '../../api/study'

const loading = ref(false)
const submitting = ref(false)
const task = ref(null)
const currentIndex = ref(0)
const card = ref(null)

const pendingItems = computed(() => task.value?.items?.filter((item) => item.status === 'PENDING') || [])
const currentItem = computed(() => pendingItems.value[currentIndex.value])

async function loadTask() {
  loading.value = true
  try {
    task.value = await fetchTodayTask()
    currentIndex.value = 0
    await loadCard()
  } finally {
    loading.value = false
  }
}

async function loadCard() {
  if (!currentItem.value) {
    card.value = null
    return
  }
  card.value = await fetchTaskItemCard(currentItem.value.itemId)
}

async function feedback(value) {
  if (!card.value) return
  submitting.value = true
  try {
    await submitTaskFeedback(card.value.itemId, { feedback: value, durationSeconds: 0 })
    ElMessage.success('反馈已提交')
    await loadTask()
  } finally {
    submitting.value = false
  }
}

onMounted(loadTask)
</script>

<template>
  <section>
    <PageHeader title="单词学习" subtitle="卡片式完成今日新词和到期复习">
      <el-button :icon="Refresh" @click="loadTask">刷新</el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />
    <EmptyState v-else-if="!card" title="暂无待学习卡片" description="今日任务完成后可以回到首页查看统计。" />

    <div v-else class="study-card-layout">
      <el-card class="study-word-card" shadow="never">
        <div class="word-kind-row">
          <el-tag>{{ card.itemType }}</el-tag>
          <el-tag type="success" v-if="card.favorite">已收藏</el-tag>
          <span>{{ card.masteryStatus }}</span>
        </div>
        <h1>{{ card.displayText }}</h1>
        <p class="phonetic">{{ card.phoneticUs || card.phoneticUk }}</p>
        <div class="definition-block">
          <span>{{ card.primaryPos }}</span>
          <strong>{{ card.primaryDefinition }}</strong>
        </div>
        <div v-if="card.exampleSentence" class="example-block">
          <p>{{ card.exampleSentence }}</p>
          <span>{{ card.exampleTranslation }}</span>
        </div>
        <div class="feedback-row">
          <el-button size="large" :loading="submitting" @click="feedback('UNKNOWN')">不认识</el-button>
          <el-button size="large" :loading="submitting" @click="feedback('VAGUE')">模糊</el-button>
          <el-button size="large" type="primary" :loading="submitting" @click="feedback('KNOWN')">认识</el-button>
        </div>
      </el-card>

      <el-card class="panel-card progress-side" shadow="never">
        <template #header>学习组</template>
        <el-progress :percentage="task?.items?.length ? Math.round(((task.doneCount || 0) / task.items.length) * 100) : 0" />
        <div class="task-lines vertical">
          <span>待完成 {{ pendingItems.length }}</span>
          <span>已完成 {{ task?.doneCount || 0 }}</span>
          <span>总计 {{ task?.items?.length || 0 }}</span>
        </div>
      </el-card>
    </div>
  </section>
</template>
