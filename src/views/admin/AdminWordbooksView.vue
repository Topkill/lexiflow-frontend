<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchAdminWordbooks } from '../../api/admin'

const loading = ref(false)
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchAdminWordbooks({ page: 1, size: 20 })
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="词库管理" subtitle="维护考试词库、状态和排序">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无词库" />
      <el-table v-else :data="page.records">
        <el-table-column prop="name" label="词库" min-width="180" />
        <el-table-column prop="code" label="编码" min-width="160" />
        <el-table-column prop="type" label="类型" width="140" />
        <el-table-column prop="wordCount" label="单词数" width="100" />
        <el-table-column prop="enabled" label="启用" width="100">
          <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '是' : '否' }}</el-tag></template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>
