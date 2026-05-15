<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createReportTask, fetchReport, fetchReports } from '../../api/ai'
import { fetchTodayTask } from '../../api/study'

const loading = ref(false)
const loadingTask = ref(false)
const creating = ref(false)
const selectedReport = ref(null)
const page = ref({ records: [], total: 0, page: 1, size: 10 })
const todayTask = ref(null)
const taskError = ref('')
const form = reactive({ reportDate: new Date().toISOString().slice(0, 10) })
const filters = reactive({ dateRange: [], page: 1, size: 10 })

const summary = computed(() => selectedReport.value?.summary || {})
const quizAccuracyText = computed(() => selectedReport.value?.quizAccuracy == null ? '暂无测验' : `${selectedReport.value.quizAccuracy}%`)

async function loadTodayTask() {
  loadingTask.value = true
  taskError.value = ''
  try {
    todayTask.value = await fetchTodayTask()
  } catch (error) {
    todayTask.value = null
    taskError.value = error.code === 30001 ? '先创建学习计划并完成今日任务后，再生成学习报告。' : error.message
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

async function createReport() {
  if (!todayTask.value?.taskId) {
    ElMessage.warning(taskError.value || '请先生成今日任务')
    return
  }
  creating.value = true
  try {
    const task = await createReportTask({ dailyTaskId: Number(todayTask.value.taskId), reportDate: form.reportDate })
    if (task.resultId) {
      selectedReport.value = await fetchReport(task.resultId)
    }
    filters.page = 1
    await loadReports(false)
    ElMessage.success('学习报告已生成')
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadTodayTask(), loadReports()])
})

async function refreshPage() {
  await Promise.all([loadTodayTask(), loadReports(false)])
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
      <el-button :icon="Refresh" @click="refreshPage">刷新</el-button>
    </PageHeader>

    <div class="report-layout">
      <div class="report-left">
        <el-card class="panel-card" shadow="never" v-loading="loadingTask">
          <template #header>生成日报</template>
          <el-form label-position="top">
            <el-form-item label="报告日期">
              <el-date-picker v-model="form.reportDate" value-format="YYYY-MM-DD" type="date" class="full-input" />
            </el-form-item>
            <el-alert
              v-if="taskError"
              class="mb-16"
              type="warning"
              :closable="false"
              :title="taskError"
            />
            <el-button class="full-button" type="primary" :loading="creating" :disabled="!todayTask?.taskId" @click="createReport">
              生成报告
            </el-button>
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
