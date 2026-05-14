<script setup>
import { onMounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchAdminUsers } from '../../api/admin'

const loading = ref(false)
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchAdminUsers({ page: 1, size: 20 })
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="用户管理" subtitle="查看用户状态、角色和学习概况">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无用户" />
      <el-table v-else :data="page.records">
        <el-table-column prop="email" label="邮箱" min-width="220" />
        <el-table-column prop="nickname" label="昵称" min-width="140" />
        <el-table-column prop="role" label="角色" width="100" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="createdAt" label="注册时间" width="180" />
      </el-table>
    </el-card>
  </section>
</template>
