<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import MetricCard from '../../components/MetricCard.vue'
import { fetchAdminOverview } from '../../api/admin'

const loading = ref(false)
const overview = ref({})

async function loadData() {
  loading.value = true
  try {
    overview.value = await fetchAdminOverview()
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="数据看板" subtitle="平台运营与 AI 调用概览">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-skeleton v-if="loading" :rows="5" animated />
    <div v-else class="metric-grid wide">
      <MetricCard label="注册用户" :value="overview.registeredUsers ?? 0" />
      <MetricCard label="活跃用户" :value="overview.activeUsers ?? 0" tone="success" />
      <MetricCard label="今日学习人数" :value="overview.todayLearners ?? 0" />
      <MetricCard label="词库数量" :value="overview.wordbookCount ?? 0" />
      <MetricCard label="单词数量" :value="overview.wordCount ?? 0" />
      <MetricCard label="AI 调用次数" :value="overview.aiCallCount ?? 0" />
      <MetricCard label="AI 成功率" :value="overview.aiSuccessRate ?? 0" suffix="%" tone="success" />
      <MetricCard label="今日 AI 调用" :value="overview.todayAiCallCount ?? 0" />
    </div>
  </section>
</template>
