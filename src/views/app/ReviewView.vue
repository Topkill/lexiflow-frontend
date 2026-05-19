<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchDueWords } from '../../api/review'
import { fetchWordbooks } from '../../api/wordbook'

const loading = ref(false)
const loadingWordbooks = ref(false)
const wordbooks = ref([])
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({ wordbookId: '', page: 1, size: 20 })

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    wordbookId: filters.wordbookId || undefined,
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
    page.value = await fetchDueWords(queryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
  } finally {
    loading.value = false
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
    <PageHeader title="复习" subtitle="到期单词会自动进入学习组">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>

    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-select v-model="filters.wordbookId" clearable filterable class="filter-grow" placeholder="全部词库" :loading="loadingWordbooks" @change="handleFilterChange">
          <el-option v-for="book in wordbooks" :key="book.id" :label="book.name" :value="book.id" />
        </el-select>
      </div>

      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无到期复习词" />
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="word" label="单词" min-width="140" />
          <el-table-column prop="primaryDefinition" label="释义" min-width="220" />
          <el-table-column prop="masteryStatus" label="状态" width="120" />
          <el-table-column prop="nextReviewDate" label="复习日期" width="140" />
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
