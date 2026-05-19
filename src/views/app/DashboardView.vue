<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Calendar, Collection, Refresh, Reading } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import MetricCard from '../../components/MetricCard.vue'
import StarterPanel from '../../components/StarterPanel.vue'
import { fetchTodayTask, fetchStudyStatistics } from '../../api/study'

const router = useRouter()
const loading = ref(false)
const task = ref(null)
const stats = ref(null)
const error = ref('')
const needsPlan = ref(false)
const primaryActionPath = computed(() => {
  if (!task.value) return '/app/plans'
  return task.value.status === 'DONE' && !task.value.clozeAttempted ? '/app/cloze' : '/app/study'
})
const primaryActionLabel = computed(() => {
  if (!task.value) return '创建计划'
  return task.value.status === 'DONE' && !task.value.clozeAttempted ? '完成本组练习' : '开始学习'
})

function taskActionPath() {
  return task.value?.status === 'DONE' && !task.value?.clozeAttempted ? '/app/cloze' : '/app/study'
}

function taskActionLabel() {
  return task.value?.status === 'DONE' && !task.value?.clozeAttempted ? '完成本组练习' : '进入学习'
}

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
    <PageHeader title="今日学习" subtitle="按组推进新词、复习和 AI 练习">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Reading" @click="router.push(primaryActionPath)">
        {{ primaryActionLabel }}
      </el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else>
      <div class="metric-grid">
        <MetricCard label="本组新词" :value="task?.newCount ?? 0" />
        <MetricCard label="本组复习" :value="task?.reviewCount ?? stats?.dueReviewWords ?? 0" tone="warn" />
        <MetricCard label="本组完成" :value="task?.doneCount ?? 0" />
        <MetricCard label="连续学习" :value="stats?.streakDays ?? 0" suffix=" 天" tone="success" />
      </div>

      <div class="work-grid dashboard-work-grid">
        <el-card class="panel-card" shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>第 {{ task?.groupNo || 1 }} 组进度</span>
              <el-tag :type="task?.status === 'DONE' ? 'success' : 'info'">{{ task?.status || '未生成' }}</el-tag>
            </div>
          </template>
          <StarterPanel
            v-if="!task"
            :title="needsPlan ? '先创建学习计划' : '学习组加载失败'"
            :description="needsPlan ? '选择词库并设置每组新词和复习词后，就可以开始学习。' : (error || '请稍后重试，或查看后端日志。')"
            :icon="needsPlan ? Calendar : Refresh"
            :error="!needsPlan"
          >
            <el-button v-if="needsPlan" type="primary" @click="router.push('/app/plans')">创建计划</el-button>
            <el-button v-if="needsPlan" @click="router.push('/app/wordbooks')">选择词库</el-button>
            <el-button v-else type="primary" @click="loadData">重试</el-button>
          </StarterPanel>
          <div v-else class="task-summary">
            <el-progress :percentage="task.progress?.completionRate ?? task.completionRate ?? 0" />
            <div class="task-lines">
              <span>新词 {{ task.newCount }}</span>
              <span>复习 {{ task.reviewCount }}</span>
              <span>额外 {{ task.extraCount }}</span>
            </div>
            <el-button type="primary" @click="router.push(taskActionPath())">
              {{ taskActionLabel() }}
              <el-icon><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>

        <el-card class="panel-card" shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>当前词库</span>
              <el-tag :type="stats?.learnedWords ? 'success' : 'info'">{{ stats?.learnedWords ? '学习中' : '未开始' }}</el-tag>
            </div>
          </template>
          <div class="progress-panel dashboard-progress-panel" :class="{ 'is-empty': !stats?.learnedWords }">
            <div class="progress-icon" v-if="!stats?.learnedWords">
              <el-icon><Collection /></el-icon>
            </div>
            <el-progress v-else type="dashboard" :percentage="Number(stats?.currentWordbookProgress || 0)" />
            <div>
              <p class="large-number">{{ stats?.learnedWords ?? 0 }}</p>
              <p class="muted">累计学习词数</p>
              <div class="wordbook-mini-stats">
                <span>待复习 {{ stats?.dueReviewWords ?? 0 }}</span>
                <span>已掌握 {{ stats?.masteredWords ?? 0 }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </template>
  </section>
</template>
