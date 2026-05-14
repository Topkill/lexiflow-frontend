<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchWrongWords, resolveWrongWord } from '../../api/review'

const loading = ref(false)
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchWrongWords({ page: 1, size: 20 })
  } finally {
    loading.value = false
  }
}

async function resolve(row) {
  await resolveWrongWord(row.wrongWordId || row.id)
  ElMessage.success('已标记解决')
  loadData()
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="错词本" subtitle="集中处理不认识和测验答错的单词">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="错词本是空的" />
      <el-table v-else :data="page.records">
        <el-table-column prop="displayText" label="单词" min-width="140" />
        <el-table-column prop="primaryDefinition" label="释义" min-width="220" />
        <el-table-column prop="wrongCount" label="错误次数" width="110" />
        <el-table-column prop="lastWrongAt" label="最近错误" width="180" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button text type="primary" @click="resolve(row)">解决</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>
