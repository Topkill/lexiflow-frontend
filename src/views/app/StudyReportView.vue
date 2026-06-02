<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createReportTask, fetchAsyncTask, fetchReport, fetchReports } from '../../api/ai'
import { fetchTodayTask } from '../../api/study'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const loadingTask = ref(false)
const creating = ref(false)
const selectedReport = ref(null)
const page = ref({ records: [], total: 0, page: 1, size: 10 })
const todayTask = ref(null)
const taskError = ref('')
const reportTaskError = ref('')
const activeReportTaskId = ref('')
const form = reactive({ reportDate: new Date().toISOString().slice(0, 10) })
const filters = reactive({ dateRange: [], page: 1, size: 10 })
const REPORT_TASK_STORAGE_PREFIX = 'lexiflow:report-task:'
const REPORT_TASK_STORAGE_VERSION = 1
const REPORT_TASK_POLL_INTERVAL_MS = 2000
let reportTaskPollTimer = null

const summary = computed(() => selectedReport.value?.summary || {})
const quizAccuracyText = computed(() => selectedReport.value?.quizAccuracy == null ? '暂无测验' : `${selectedReport.value.quizAccuracy}%`)

async function loadTodayTask() {
  loadingTask.value = true
  taskError.value = ''
  try {
    todayTask.value = await fetchTodayTask()
  } catch (error) {
    todayTask.value = null
    taskError.value = error.code === 30001 ? '先创建学习计划并完成学习组后，再生成学习报告。' : error.message
  } finally {
    loadingTask.value = false
  }
}

function reportQueryParams() {
  return {
    page: filters.page,
    size: filters.size,
    startDate: filters.dateRange?.[0] || undefined,
    endDate: filters.dateRange?.[1] || undefined,
  }
}

async function loadReports(selectFirst = true) {
  if (loading.value) return
  loading.value = true
  try {
    page.value = await fetchReports(reportQueryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
    if (selectFirst && page.value.records.length > 0) {
      selectedReport.value = page.value.records[0]
    }
  } finally {
    loading.value = false
  }
}

async function selectReport(report) {
  selectedReport.value = await fetchReport(report.id)
}

function getReportTaskStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function reportTaskStorageKey(userId = auth.user?.id) {
  return userId ? `${REPORT_TASK_STORAGE_PREFIX}${userId}` : ''
}

function saveActiveReportTask(taskId) {
  const storage = getReportTaskStorage()
  const key = reportTaskStorageKey()
  if (!storage || !key || !taskId) return
  try {
    storage.setItem(key, JSON.stringify({
      version: REPORT_TASK_STORAGE_VERSION,
      taskId: String(taskId),
      dailyTaskId: todayTask.value?.taskId == null ? null : String(todayTask.value.taskId),
      reportDate: form.reportDate,
      updatedAt: Date.now(),
    }))
  } catch {
    // 本地存储不可用时，当前页面仍会继续轮询。
  }
}

function clearActiveReportTask() {
  const storage = getReportTaskStorage()
  const key = reportTaskStorageKey()
  if (!storage || !key) return
  try {
    storage.removeItem(key)
  } catch {
    // 清理失败不影响任务查询。
  }
}

function restoreActiveReportTask() {
  const storage = getReportTaskStorage()
  const key = reportTaskStorageKey()
  if (!storage || !key) return false
  let cache
  try {
    cache = JSON.parse(storage.getItem(key) || 'null')
  } catch {
    clearActiveReportTask()
    return false
  }
  if (!cache || cache.version !== REPORT_TASK_STORAGE_VERSION || !cache.taskId) {
    return false
  }
  form.reportDate = cache.reportDate || form.reportDate
  void startReportTaskPolling(cache.taskId)
  return true
}

function stopReportTaskPolling(resetCreating = true) {
  if (reportTaskPollTimer) {
    window.clearInterval(reportTaskPollTimer)
    reportTaskPollTimer = null
  }
  activeReportTaskId.value = ''
  if (resetCreating) {
    creating.value = false
  }
}

async function finishReportTask(reportId) {
  stopReportTaskPolling(false)
  clearActiveReportTask()
  creating.value = false
  selectedReport.value = await fetchReport(reportId)
  filters.page = 1
  await loadReports(false)
  ElMessage.success('学习报告已生成')
}

async function pollReportTask(taskId) {
  if (!taskId) return
  try {
    const task = await fetchAsyncTask(taskId, { silentError: true })
    const status = String(task?.status || '')
    if (status === 'SUCCESS') {
      if (!task.resultId) {
        throw new Error('学习报告生成完成，但没有返回报告 ID')
      }
      await finishReportTask(task.resultId)
      return
    }
    if (status === 'FAILED') {
      stopReportTaskPolling()
      clearActiveReportTask()
      reportTaskError.value = '学习报告生成失败，请稍后重试。'
      return
    }
    creating.value = true
  } catch (error) {
    stopReportTaskPolling()
    clearActiveReportTask()
    reportTaskError.value = error?.message || '学习报告任务状态查询失败，请稍后重试。'
  }
}

async function startReportTaskPolling(taskId) {
  if (!taskId) return
  stopReportTaskPolling(false)
  activeReportTaskId.value = String(taskId)
  creating.value = true
  reportTaskError.value = ''
  saveActiveReportTask(taskId)
  await pollReportTask(taskId)
  if (creating.value && activeReportTaskId.value === String(taskId) && !reportTaskPollTimer) {
    reportTaskPollTimer = window.setInterval(() => {
      void pollReportTask(taskId)
    }, REPORT_TASK_POLL_INTERVAL_MS)
  }
}

async function createReport() {
  if (creating.value) return
  if (!todayTask.value?.taskId) {
    ElMessage.warning(taskError.value || '请先生成学习组')
    return
  }
  creating.value = true
  reportTaskError.value = ''
  try {
    const task = await createReportTask({ dailyTaskId: todayTask.value.taskId, reportDate: form.reportDate }, { silentError: true })
    if (task.resultId) {
      await finishReportTask(task.resultId)
      return
    }
    if (!task.taskId) {
      throw new Error('学习报告任务创建成功，但没有返回任务 ID')
    }
    await startReportTaskPolling(task.taskId)
  } catch (error) {
    stopReportTaskPolling()
    reportTaskError.value = error?.message || '学习报告生成失败，请稍后重试。'
  }
}

onMounted(async () => {
  await Promise.all([loadTodayTask(), loadReports()])
  restoreActiveReportTask()
})

onBeforeUnmount(() => {
  stopReportTaskPolling(false)
})

async function refreshPage() {
  await Promise.all([loadTodayTask(), loadReports(false)])
  restoreActiveReportTask()
}

function searchReports() {
  filters.page = 1
  loadReports(true)
}

function resetReportFilters() {
  Object.assign(filters, { dateRange: [], page: 1 })
  loadReports(true)
}

function handleReportPageChange(currentPage) {
  filters.page = currentPage
  loadReports(true)
}
</script>

<template>
  <section>
    <PageHeader title="学习报告" subtitle="每日完成学习后生成 AI 反馈">
      <el-button :icon="Refresh" :disabled="creating || loading || loadingTask" @click="refreshPage">刷新</el-button>
    </PageHeader>

    <div class="report-layout">
      <div class="report-left">
        <el-card class="panel-card" shadow="never" v-loading="loadingTask">
          <template #header>生成日报</template>
          <el-form class="report-create-form" label-position="top">
            <div class="report-create-row">
              <el-form-item label="报告日期" class="report-date-field">
                <el-date-picker v-model="form.reportDate" value-format="YYYY-MM-DD" type="date" class="full-input" />
              </el-form-item>
              <el-button class="report-create-button" type="primary" :loading="creating" :disabled="creating || !todayTask?.taskId" @click="createReport">
                {{ creating ? '生成中' : '生成报告' }}
              </el-button>
            </div>
            <el-alert
              v-if="activeReportTaskId && creating"
              class="mb-16"
              type="info"
              :closable="false"
              title="学习报告生成中，完成后会自动打开。"
            />
            <el-alert
              v-if="reportTaskError"
              class="mb-16"
              type="warning"
              :closable="false"
              :title="reportTaskError"
            />
            <el-alert
              v-if="taskError"
              class="mb-16"
              type="warning"
              :closable="false"
              :title="taskError"
            />
          </el-form>
        </el-card>

        <el-card class="panel-card mt-16" shadow="never">
          <template #header>历史报告</template>
          <div class="report-filter-row">
            <el-date-picker v-model="filters.dateRange" value-format="YYYY-MM-DD" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" @change="searchReports" />
            <div class="button-row">
              <el-button size="small" @click="searchReports">筛选</el-button>
              <el-button size="small" @click="resetReportFilters">重置</el-button>
            </div>
          </div>
          <el-skeleton v-if="loading" :rows="5" animated />
          <EmptyState v-else-if="page.records.length === 0" title="暂无学习报告" />
          <template v-else>
            <div class="report-list compact">
              <button
                v-for="report in page.records"
                :key="report.id"
                class="report-list-item"
                :class="{ active: selectedReport?.id === report.id }"
                type="button"
                @click="selectReport(report)"
              >
                <strong>{{ report.reportDate }}</strong>
                <span>新词 {{ report.newWordsCount }}，复习 {{ report.reviewWordsCount }}</span>
              </button>
            </div>
            <div class="pagination-row">
              <el-pagination
                small
                background
                layout="total, prev, pager, next"
                :current-page="Number(page.page)"
                :page-size="Number(page.size)"
                :total="Number(page.total)"
                @current-change="handleReportPageChange"
              />
            </div>
          </template>
        </el-card>
      </div>

      <el-card class="panel-card report-detail" shadow="never">
        <template #header>
          <div class="card-header-row">
            <span>报告详情</span>
            <el-tag v-if="selectedReport">{{ selectedReport.reportDate }}</el-tag>
          </div>
        </template>
        <EmptyState v-if="!selectedReport" title="选择一份报告" description="生成或选择历史报告后，这里会展示 AI 学习建议。" />
        <template v-else>
          <div class="report-metrics">
            <div>
              <span>新词</span>
              <strong>{{ selectedReport.newWordsCount }}</strong>
            </div>
            <div>
              <span>复习</span>
              <strong>{{ selectedReport.reviewWordsCount }}</strong>
            </div>
            <div>
              <span>测验正确率</span>
              <strong>{{ quizAccuracyText }}</strong>
            </div>
          </div>

          <div class="report-summary-grid">
            <div class="report-summary-item">
              <span>表现总结</span>
              <p>{{ summary.performance || '暂无总结' }}</p>
            </div>
            <div class="report-summary-item">
              <span>薄弱点</span>
              <p>{{ summary.weakness || '暂无薄弱点分析' }}</p>
            </div>
            <div class="report-summary-item">
              <span>明日建议</span>
              <p>{{ summary.tomorrowAdvice || '暂无建议' }}</p>
            </div>
          </div>

          <div class="report-markdown">
            {{ selectedReport.markdownContent || '暂无报告正文' }}
          </div>
        </template>
      </el-card>
    </div>
  </section>
</template>
