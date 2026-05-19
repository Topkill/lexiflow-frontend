<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search, View } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { fetchAdminAiLogs } from '../../api/admin'

const scopeOptions = ['PUBLIC', 'PRIVATE']
const statusOptions = ['SUCCESS', 'FAILED']
const contentTypeOptions = ['WORD_QA', 'CLOZE', 'REPORT', 'EXPLANATION', 'EXAMPLES', 'MNEMONIC']

const loading = ref(false)
const detailVisible = ref(false)
const currentLog = ref(null)
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({ userId: '', configScope: '', contentType: '', status: '', dateRange: [], page: 1, size: 20 })

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    userId: filters.userId || undefined,
    configScope: filters.configScope || undefined,
    contentType: filters.contentType || undefined,
    status: filters.status || undefined,
    startDate: filters.dateRange?.[0] || undefined,
    endDate: filters.dateRange?.[1] || undefined,
  }
}

function statusTagType(status) {
  return status === 'SUCCESS' ? 'success' : 'danger'
}

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchAdminAiLogs(queryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
  } finally {
    loading.value = false
  }
}

function searchLogs() {
  filters.page = 1
  loadData()
}

function resetFilters() {
  Object.assign(filters, { userId: '', configScope: '', contentType: '', status: '', dateRange: [], page: 1 })
  loadData()
}

function handlePageChange(currentPage) {
  filters.page = currentPage
  loadData()
}

function handleSizeChange(size) {
  filters.page = 1
  filters.size = size
  loadData()
}

function openDetail(row) {
  currentLog.value = row
  detailVisible.value = true
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="AI 调用日志" subtitle="模型、Token、耗时和失败原因">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-input v-model.trim="filters.userId" clearable placeholder="用户 ID" />
        <el-select v-model="filters.configScope" clearable placeholder="配置来源" @change="searchLogs">
          <el-option v-for="item in scopeOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.contentType" clearable filterable placeholder="内容类型" @change="searchLogs">
          <el-option v-for="item in contentTypeOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.status" clearable placeholder="状态" @change="searchLogs">
          <el-option v-for="item in statusOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-date-picker v-model="filters.dateRange" value-format="YYYY-MM-DD" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" @change="searchLogs" />
        <el-button type="primary" :icon="Search" @click="searchLogs">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无 AI 调用日志" />
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="contentType" label="类型" width="160" />
          <el-table-column prop="configScope" label="配置" width="100" />
          <el-table-column prop="modelName" label="模型" min-width="160" show-overflow-tooltip />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }"><el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="totalTokens" label="Token" width="100" />
          <el-table-column prop="latencyMs" label="耗时 ms" width="110" />
          <el-table-column prop="createdAt" label="时间" width="180" />
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button text type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-row">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next"
            :current-page="Number(page.page)"
            :page-size="Number(page.size)"
            :page-sizes="[10, 20, 50, 100]"
            :total="Number(page.total)"
            @current-change="handlePageChange"
            @size-change="handleSizeChange"
          />
        </div>
      </template>
    </el-card>

    <el-drawer v-model="detailVisible" title="AI 调用详情" size="460px">
      <EmptyState v-if="!currentLog" title="请选择日志" />
      <template v-else>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="日志 ID">{{ currentLog.id }}</el-descriptions-item>
          <el-descriptions-item label="用户 ID">{{ currentLog.userId || '-' }}</el-descriptions-item>
          <el-descriptions-item label="内容类型">{{ currentLog.contentType }}</el-descriptions-item>
          <el-descriptions-item label="配置来源">{{ currentLog.configScope }}</el-descriptions-item>
          <el-descriptions-item label="模型">{{ currentLog.modelName }}</el-descriptions-item>
          <el-descriptions-item label="API Base URL">{{ currentLog.apiBaseUrl }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(currentLog.status)">{{ currentLog.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Prompt Token">{{ currentLog.promptTokens ?? 0 }}</el-descriptions-item>
          <el-descriptions-item label="Completion Token">{{ currentLog.completionTokens ?? 0 }}</el-descriptions-item>
          <el-descriptions-item label="总 Token">{{ currentLog.totalTokens ?? 0 }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ currentLog.latencyMs ?? 0 }} ms</el-descriptions-item>
          <el-descriptions-item label="错误码">{{ currentLog.errorCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="错误信息">{{ currentLog.errorMessage || '-' }}</el-descriptions-item>
          <el-descriptions-item label="调用时间">{{ currentLog.createdAt }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </section>
</template>
