<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Refresh, Reading } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import MetricCard from '../../components/MetricCard.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchTodayTask, fetchStudyStatistics } from '../../api/study'

const router = useRouter()
const loading = ref(false)
const task = ref(null)
const stats = ref(null)
const error = ref('')
const needsPlan = ref(false)
const primaryActionPath = computed(() => {
  if (!task.value) return '/app/plans'
  return task.value.status === 'DONE' ? '/app/cloze' : '/app/study'
})
const primaryActionLabel = computed(() => {
  if (!task.value) return '创建计划'
  return task.value.status === 'DONE' ? '生成练习' : '开始学习'
})

async function loadData() {
  loading.value = true
  error.value = ''
  try {
    const [todayTask, overview] = await Promise.allSettled([fetchTodayTask(), fetchStudyStatistics()])
    if (todayTask.status === 'fulfilled') task.value = todayTask.value
    if (overview.status === 'fulfilled') stats.value = overview.value
    if (todayTask.status === 'rejected') {
      needsPlan.value = todayTask.reason.code === 30001
      error.value = needsPlan.value ? '' : todayTask.reason.message
    } else {
      needsPlan.value = false
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="今日任务" subtitle="新词、复习和 AI 练习从这里开始">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Reading" @click="router.push(primaryActionPath)">
        {{ primaryActionLabel }}
      </el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else>
      <div class="metric-grid">
        <MetricCard label="今日新词" :value="task?.newCount ?? 0" />
        <MetricCard label="待复习" :value="task?.reviewCount ?? stats?.dueReviewWords ?? 0" tone="warn" />
        <MetricCard label="已完成" :value="task?.doneCount ?? 0" />
        <MetricCard label="连续学习" :value="stats?.streakDays ?? 0" suffix=" 天" tone="success" />
      </div>

      <div class="work-grid">
        <el-card class="panel-card" shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>任务进度</span>
              <el-tag :type="task?.status === 'DONE' ? 'success' : 'info'">{{ task?.status || '未生成' }}</el-tag>
            </div>
          </template>
          <EmptyState
            v-if="!task"
            :title="needsPlan ? '先创建学习计划' : '今日任务加载失败'"
            :description="needsPlan ? '选择一个词库和每日新词数量后，系统会自动生成今日任务。' : (error || '请稍后重试，或查看后端日志。')"
          >
            <el-button v-if="needsPlan" type="primary" @click="router.push('/app/plans')">创建计划</el-button>
            <el-button v-if="needsPlan" @click="router.push('/app/wordbooks')">选择词库</el-button>
            <el-button v-else type="primary" @click="loadData">重试</el-button>
          </EmptyState>
          <div v-else class="task-summary">
            <el-progress :percentage="task.progress?.completionRate ?? task.completionRate ?? 0" />
            <div class="task-lines">
              <span>新词 {{ task.newCount }}</span>
              <span>复习 {{ task.reviewCount }}</span>
              <span>额外 {{ task.extraCount }}</span>
            </div>
            <el-button type="primary" @click="router.push(task.status === 'DONE' ? '/app/cloze' : '/app/study')">
              {{ task.status === 'DONE' ? '生成完形填空' : '进入学习' }}
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>

        <el-card class="panel-card" shadow="never">
          <template #header>当前词库</template>
          <div class="progress-panel">
            <el-progress type="dashboard" :percentage="Number(stats?.currentWordbookProgress || 0)" />
            <div>
              <p class="large-number">{{ stats?.learnedWords ?? 0 }}</p>
              <p class="muted">累计学习词数</p>
            </div>
          </div>
        </el-card>
      </div>
    </template>
  </section>
</template>
