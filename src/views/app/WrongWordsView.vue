<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, VideoPlay } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchWrongWords, resolveWrongWord } from '../../api/review'
import { createWrongWordPractice } from '../../api/study'
import { fetchWordbooks } from '../../api/wordbook'

const router = useRouter()
const loading = ref(false)
const loadingWordbooks = ref(false)
const practicing = ref(false)
const resolvingId = ref('')
const wordbooks = ref([])
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({ wordbookId: '', sortBy: 'wrongCount', sortOrder: 'desc', page: 1, size: 20 })

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    wordbookId: filters.wordbookId || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  }
}

async function loadWordbooks() {
  loadingWordbooks.value = true
  try {
    wordbooks.value = await fetchWordbooks()
  } finally {
    loadingWordbooks.value = false
  }
}

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchWrongWords(queryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
  } finally {
    loading.value = false
  }
}

async function resolve(row) {
  resolvingId.value = row.wrongWordId || row.id
  try {
    await resolveWrongWord(resolvingId.value)
    ElMessage.success('已标记解决')
    await loadData()
  } finally {
    resolvingId.value = ''
  }
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

function handleFilterChange() {
  filters.page = 1
  loadData()
}

function handlePageChange(currentPage) {
  filters.page = currentPage
  loadData()
}

onMounted(() => {
  loadWordbooks()
  loadData()
})
</script>

<template>
  <section>
    <PageHeader title="错词本" subtitle="集中处理不认识和测验答错的单词">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="VideoPlay" :loading="practicing" :disabled="page.records.length === 0" @click="startPractice">专项复习</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-select v-model="filters.wordbookId" clearable filterable class="filter-grow" placeholder="全部词库" :loading="loadingWordbooks" @change="handleFilterChange">
          <el-option v-for="book in wordbooks" :key="book.id" :label="book.name" :value="book.id" />
        </el-select>
        <el-select v-model="filters.sortBy" placeholder="排序字段" @change="handleFilterChange">
          <el-option label="错误次数" value="wrongCount" />
          <el-option label="最近错误" value="lastWrongAt" />
        </el-select>
        <el-segmented
          v-model="filters.sortOrder"
          :options="[
            { label: '降序', value: 'desc' },
            { label: '升序', value: 'asc' },
          ]"
          @change="handleFilterChange"
        />
      </div>

      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="错词本是空的" />
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="displayText" label="单词" min-width="140" />
          <el-table-column prop="primaryDefinition" label="释义" min-width="220" />
          <el-table-column prop="wrongCount" label="错误次数" width="110" />
          <el-table-column prop="lastWrongAt" label="最近错误" width="180" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button text type="primary" :loading="resolvingId === row.wrongWordId" @click="resolve(row)">解决</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-row">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :current-page="Number(page.page)"
            :page-size="Number(page.size)"
            :total="Number(page.total)"
            @current-change="handlePageChange"
          />
        </div>
      </template>
    </el-card>
  </section>
</template>
