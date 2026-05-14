<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, VideoPlay } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchWrongWords, resolveWrongWord } from '../../api/review'
import { createWrongWordPractice } from '../../api/study'

const router = useRouter()
const loading = ref(false)
const practicing = ref(false)
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

async function startPractice() {
  practicing.value = true
  try {
    const task = await createWrongWordPractice({ limit: 10 })
    if ((task.extraCount || 0) > 0) {
      ElMessage.success('已加入今日专项复习')
      router.push('/app/study')
    } else {
      ElMessage.info('暂无可加入的错词，可能已在今日任务中')
    }
  } finally {
    practicing.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="错词本" subtitle="集中处理不认识和测验答错的单词">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="VideoPlay" :loading="practicing" :disabled="page.records.length === 0" @click="startPractice">专项复习</el-button>
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
