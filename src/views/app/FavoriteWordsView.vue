<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { deleteFavoriteWord, fetchFavoriteWords } from '../../api/review'

const loading = ref(false)
const deletingId = ref('')
const page = ref({ records: [], total: 0 })

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchFavoriteWords({ page: 1, size: 20 })
  } finally {
    loading.value = false
  }
}

async function removeFavorite(row) {
  deletingId.value = row.favoriteWordId
  try {
    await deleteFavoriteWord(row.favoriteWordId)
    ElMessage.success('已取消收藏')
    await loadData()
  } finally {
    deletingId.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="收藏词" subtitle="复盘你主动标记的重要单词">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无收藏词" />
      <el-table v-else :data="page.records">
        <el-table-column prop="displayText" label="单词" min-width="140" />
        <el-table-column prop="primaryDefinition" label="释义" min-width="220" />
        <el-table-column prop="note" label="备注" min-width="160" />
        <el-table-column prop="createdAt" label="收藏时间" width="180" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text type="danger" :icon="Delete" :loading="deletingId === row.favoriteWordId" @click="removeFavorite(row)">取消</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>
