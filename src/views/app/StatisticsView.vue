<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import MetricCard from '../../components/MetricCard.vue'
import { fetchStudyStatistics } from '../../api/study'

const loading = ref(false)
const stats = ref({})

async function loadStats() {
  loading.value = true
  try {
    stats.value = await fetchStudyStatistics()
  } finally {
    loading.value = false
  }
}

onMounted(loadStats)
</script>

<template>
  <section>
    <PageHeader title="学习统计" subtitle="累计进度、复习压力和测验表现">
      <el-button :icon="Refresh" @click="loadStats">刷新</el-button>
    </PageHeader>
    <el-skeleton v-if="loading" :rows="5" animated />
    <template v-else>
      <div class="metric-grid wide">
        <MetricCard label="累计学习" :value="stats.learnedWords ?? 0" />
        <MetricCard label="已掌握" :value="stats.masteredWords ?? 0" tone="success" />
        <MetricCard label="待复习" :value="stats.dueReviewWords ?? 0" tone="warn" />
        <MetricCard label="困难词" :value="stats.difficultWords ?? 0" tone="danger" />
        <MetricCard label="连续学习" :value="stats.streakDays ?? 0" suffix=" 天" />
        <MetricCard label="任务完成率" :value="stats.todayTaskCompletionRate ?? 0" suffix="%" />
        <MetricCard label="完形正确率" :value="stats.clozeAccuracy ?? 0" suffix="%" />
        <MetricCard label="词库进度" :value="stats.currentWordbookProgress ?? 0" suffix="%" />
      </div>
    </template>
  </section>
</template>
