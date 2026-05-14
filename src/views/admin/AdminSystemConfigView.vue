<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchSystemConfigs } from '../../api/admin'

const loading = ref(false)
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchSystemConfigs({ page: 1, size: 50 })
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="系统配置" subtitle="管理后台可编辑的平台配置项">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无系统配置" />
      <el-table v-else :data="page.records">
        <el-table-column prop="configKey" label="配置键" min-width="220" />
        <el-table-column prop="configValue" label="配置值" min-width="220" show-overflow-tooltip />
        <el-table-column prop="valueType" label="类型" width="110" />
        <el-table-column prop="editable" label="可编辑" width="100">
          <template #default="{ row }"><el-tag :type="row.editable ? 'success' : 'info'">{{ row.editable ? '是' : '否' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" />
      </el-table>
    </el-card>
  </section>
</template>
