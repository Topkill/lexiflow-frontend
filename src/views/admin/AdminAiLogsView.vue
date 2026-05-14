<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchAdminAiLogs } from '../../api/admin'

const loading = ref(false)
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchAdminAiLogs({ page: 1, size: 20 })
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="AI 调用日志" subtitle="模型、Token、耗时和失败原因">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无 AI 调用日志" />
      <el-table v-else :data="page.records">
        <el-table-column prop="contentType" label="类型" width="140" />
        <el-table-column prop="configScope" label="配置" width="100" />
        <el-table-column prop="modelName" label="模型" min-width="160" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="totalTokens" label="Token" width="100" />
        <el-table-column prop="latencyMs" label="耗时 ms" width="110" />
        <el-table-column prop="createdAt" label="时间" width="180" />
      </el-table>
    </el-card>
  </section>
</template>
