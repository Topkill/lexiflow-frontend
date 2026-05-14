<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchDueWords } from '../../api/review'

const loading = ref(false)
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchDueWords({ page: 1, size: 20 })
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="复习" subtitle="到期单词会自动进入今日任务">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无到期复习词" />
      <el-table v-else :data="page.records">
        <el-table-column prop="displayText" label="单词" min-width="140" />
        <el-table-column prop="primaryDefinition" label="释义" min-width="220" />
        <el-table-column prop="masteryStatus" label="状态" width="120" />
        <el-table-column prop="nextReviewDate" label="复习日期" width="140" />
      </el-table>
    </el-card>
  </section>
</template>
