<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Refresh, Upload } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  downloadWordImportErrorReport,
  downloadWordImportTemplate,
  fetchAdminWordbooks,
  fetchWordImportErrors,
  fetchWordImportTask,
  fetchWordImportTasks,
  importAdminWords,
  importAdminWordsFromJsonUrl,
} from '../../api/admin'

const IMPORT_TASK_POLL_INTERVAL_MS = 2000
const TERMINAL_IMPORT_STATUSES = new Set(['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED'])

const loadingWordbooks = ref(false)
const loadingImportTasks = ref(false)
const uploading = ref(false)
const importingJson = ref(false)
const downloading = ref(false)
const excelWordbookId = ref('')
const jsonWordbookId = ref('')
const duplicateStrategy = ref('SKIP')
const jsonDuplicateStrategy = ref('SKIP')
const jsonSourceUrl = ref('https://files.typewords.cc/dicts/en/word/CET4_T.json')
const replaceWordbook = ref(false)
const wordbooks = ref([])
const selectedFile = ref(null)
const uploadRef = ref()
const importTask = ref(null)
const importTaskPage = ref({ records: [], total: 0, page: 1, size: 5 })
const errorPage = ref({ records: [], total: 0, page: 1, size: 20 })
const importTaskPollTimer = ref(null)
const pollingImportTaskId = ref('')

function saveBlob(response, fallbackName) {
  const disposition = response.headers?.['content-disposition'] || ''
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/)
  const fileName = match ? decodeURIComponent(match[1]) : fallbackName
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function loadWordbooks() {
  loadingWordbooks.value = true
  try {
    const result = await fetchAdminWordbooks({ page: 1, size: 100 })
    wordbooks.value = result.records || []
    const defaultWordbookId = wordbooks.value[0]?.id || ''
    if (!wordbooks.value.some((book) => book.id === excelWordbookId.value)) {
      excelWordbookId.value = defaultWordbookId
    }
    if (!wordbooks.value.some((book) => book.id === jsonWordbookId.value)) {
      jsonWordbookId.value = ''
    }
  } finally {
    loadingWordbooks.value = false
  }
}

async function downloadTemplate() {
  downloading.value = true
  try {
    const response = await downloadWordImportTemplate()
    saveBlob(response, 'lexiflow-word-import-template.xlsx')
  } finally {
    downloading.value = false
  }
}

function handleFileChange(file) {
  selectedFile.value = file.raw
}

function clearFile() {
  selectedFile.value = null
}

function resetUploadFile() {
  selectedFile.value = null
  uploadRef.value?.clearFiles()
}

function isImportTaskTerminal(task) {
  return !task?.status || TERMINAL_IMPORT_STATUSES.has(task.status)
}

function stopImportTaskPolling() {
  if (importTaskPollTimer.value) {
    window.clearInterval(importTaskPollTimer.value)
    importTaskPollTimer.value = null
  }
  pollingImportTaskId.value = ''
}

function updateImportTaskInPage(task) {
  const index = importTaskPage.value.records.findIndex((item) => item.id === task.id)
  if (index >= 0) {
    importTaskPage.value.records.splice(index, 1, task)
  }
}

function showImportTaskFinished(task) {
  if (task.status === 'FAILED') {
    ElMessage.error(`导入任务 #${task.id} 执行失败`)
    return
  }
  if (task.failedRows) {
    ElMessage.warning(`导入任务 #${task.id} 完成，${task.failedRows} 行失败`)
    return
  }
  ElMessage.success(`导入任务 #${task.id} 完成`)
}

async function pollImportTask(taskId) {
  try {
    const latestTask = await fetchWordImportTask(taskId)
    const isSelectedTask = importTask.value?.id === latestTask.id
    if (isSelectedTask) {
      importTask.value = latestTask
    }
    updateImportTaskInPage(latestTask)
    if (!isImportTaskTerminal(latestTask)) {
      return
    }
    stopImportTaskPolling()
    showImportTaskFinished(latestTask)
    await loadWordbooks()
    await loadImportTasks(importTaskPage.value.page, isSelectedTask ? latestTask : importTask.value)
    if (isSelectedTask && latestTask.failedRows) {
      await loadErrors(1)
    }
  } catch {
    stopImportTaskPolling()
  }
}

function startImportTaskPolling(task) {
  stopImportTaskPolling()
  if (!task?.id || isImportTaskTerminal(task)) {
    return
  }
  pollingImportTaskId.value = task.id
  pollImportTask(task.id)
  importTaskPollTimer.value = window.setInterval(() => pollImportTask(task.id), IMPORT_TASK_POLL_INTERVAL_MS)
}

async function submitImport() {
  if (!excelWordbookId.value) {
    ElMessage.warning('请先选择词库')
    return
  }
  if (!selectedFile.value) {
    ElMessage.warning('请先选择 Excel 文件')
    return
  }
  uploading.value = true
  try {
    importTask.value = await importAdminWords(excelWordbookId.value, duplicateStrategy.value, selectedFile.value)
    ElMessage.success(`Excel 导入任务 #${importTask.value.id} 已提交`)
    resetUploadFile()
    await loadImportTasks(1, importTask.value)
    startImportTaskPolling(importTask.value)
  } finally {
    uploading.value = false
  }
}

async function submitJsonImport() {
  if (!jsonWordbookId.value) {
    ElMessage.warning('请先选择词库')
    return
  }
  if (!jsonSourceUrl.value.trim()) {
    ElMessage.warning('请填写 JSON URL')
    return
  }
  if (replaceWordbook.value) {
    const targetWordbook = wordbooks.value.find((book) => book.id === jsonWordbookId.value)
    const targetName = targetWordbook ? `${targetWordbook.name} (${targetWordbook.wordCount || 0})` : `词库 #${jsonWordbookId.value}`
    try {
      await ElMessageBox.confirm(
        `确定先清空「${targetName}」现有单词再导入 JSON 吗？`,
        '确认替换词库单词',
        {
          type: 'warning',
          confirmButtonText: '清空并导入',
          cancelButtonText: '取消',
        },
      )
    } catch {
      return
    }
  }
  importingJson.value = true
  try {
    importTask.value = await importAdminWordsFromJsonUrl(jsonWordbookId.value, {
      sourceUrl: jsonSourceUrl.value.trim(),
      duplicateStrategy: jsonDuplicateStrategy.value,
      replaceWordbook: replaceWordbook.value,
    })
    ElMessage.success(`JSON 导入任务 #${importTask.value.id} 已提交`)
    await loadImportTasks(1, importTask.value)
    startImportTaskPolling(importTask.value)
  } finally {
    importingJson.value = false
  }
}

function getTaskStatusType(task) {
  if (task.status === 'FAILED') return 'danger'
  if (task.status === 'PARTIAL_SUCCESS' || task.failedRows) return 'warning'
  if (task.status === 'RUNNING' || task.status === 'PENDING') return 'info'
  return 'success'
}

async function loadImportTasks(currentPage = importTaskPage.value.page, preferredTask = null) {
  loadingImportTasks.value = true
  try {
    const page = await fetchWordImportTasks({ page: currentPage, size: importTaskPage.value.size })
    const records = page.records || []
    importTaskPage.value = {
      records,
      total: page.total || 0,
      page: page.page || currentPage,
      size: page.size || importTaskPage.value.size,
    }
    const selectedTask = (preferredTask && records.find((task) => task.id === preferredTask.id))
      || records.find((task) => task.id === importTask.value?.id)
      || records[0]
      || null
    importTask.value = selectedTask
    await loadErrors(1)
    if (selectedTask && !isImportTaskTerminal(selectedTask) && !importTaskPollTimer.value) {
      startImportTaskPolling(selectedTask)
    }
  } finally {
    loadingImportTasks.value = false
  }
}

async function loadErrors(currentPage = errorPage.value.page) {
  if (!importTask.value?.id || !importTask.value.failedRows) {
    errorPage.value = { records: [], total: 0, page: 1, size: errorPage.value.size }
    return
  }
  errorPage.value = await fetchWordImportErrors(importTask.value.id, { page: currentPage, size: errorPage.value.size })
}

async function handleErrorPageChange(currentPage) {
  await loadErrors(currentPage)
}

async function selectImportTask(task) {
  importTask.value = task
  await loadErrors(1)
  if (isImportTaskTerminal(task)) {
    if (pollingImportTaskId.value === task.id) {
      stopImportTaskPolling()
    }
  } else {
    startImportTaskPolling(task)
  }
}

async function handleTaskPageChange(currentPage) {
  await loadImportTasks(currentPage)
}

async function downloadErrorReport(task = importTask.value) {
  if (!task?.id) return
  const response = await downloadWordImportErrorReport(task.id)
  saveBlob(response, `lexiflow-word-import-errors-${task.id}.xlsx`)
}

async function loadPageData() {
  await Promise.all([loadWordbooks(), loadImportTasks(1)])
}

onMounted(loadPageData)
onBeforeUnmount(stopImportTaskPolling)
</script>

<template>
  <section>
    <PageHeader title="单词导入" subtitle="支持模板 Excel 上传，也支持从 JSON URL 导入词库单词">
      <el-button :icon="Refresh" @click="loadPageData">刷新数据</el-button>
      <el-button :icon="Download" :loading="downloading" @click="downloadTemplate">下载模板</el-button>
    </PageHeader>

    <div class="work-grid">
      <el-card class="panel-card" shadow="never">
        <template #header>Excel 导入</template>
        <el-form label-position="top">
          <el-form-item label="目标词库">
            <el-select v-model="excelWordbookId" class="full-input" filterable placeholder="选择词库" :loading="loadingWordbooks">
              <el-option v-for="book in wordbooks" :key="book.id" :label="`${book.name} (${book.wordCount || 0})`" :value="book.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="重复处理策略">
            <el-segmented
              v-model="duplicateStrategy"
              :options="[
                { label: '跳过', value: 'SKIP' },
                { label: '覆盖', value: 'OVERWRITE' },
                { label: '补空', value: 'FILL_EMPTY' },
              ]"
            />
          </el-form-item>
          <el-form-item label="Excel 文件">
            <el-upload ref="uploadRef" drag accept=".xlsx" :auto-upload="false" :limit="1" :on-change="handleFileChange" :on-remove="clearFile">
              <el-icon><Upload /></el-icon>
              <div class="el-upload__text">拖拽文件到这里，或点击选择</div>
              <template #tip>
                <div class="el-upload__tip">仅支持固定模板的 .xlsx 文件</div>
              </template>
            </el-upload>
          </el-form-item>
          <el-button type="primary" :loading="uploading" @click="submitImport">开始导入</el-button>
        </el-form>
      </el-card>

      <el-card class="panel-card" shadow="never">
        <template #header>JSON URL 导入</template>
        <el-form label-position="top">
          <el-form-item label="目标词库">
            <el-select v-model="jsonWordbookId" class="full-input" filterable placeholder="选择词库" :loading="loadingWordbooks">
              <el-option v-for="book in wordbooks" :key="book.id" :label="`${book.name} (${book.wordCount || 0})`" :value="book.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="JSON URL">
            <el-input v-model.trim="jsonSourceUrl" placeholder="https://files.typewords.cc/dicts/en/word/CET4_T.json" />
          </el-form-item>
          <el-form-item label="重复处理策略">
            <el-segmented
              v-model="jsonDuplicateStrategy"
              :options="[
                { label: '跳过', value: 'SKIP' },
                { label: '覆盖', value: 'OVERWRITE' },
                { label: '补空', value: 'FILL_EMPTY' },
              ]"
            />
          </el-form-item>
          <el-form-item label="导入模式">
            <el-segmented
              v-model="replaceWordbook"
              :options="[
                { label: '追加导入', value: false },
                { label: '清空后导入', value: true },
              ]"
            />
          </el-form-item>
          <el-button type="primary" :loading="importingJson" @click="submitJsonImport">导入 JSON</el-button>
        </el-form>
      </el-card>

      <el-card v-loading="loadingImportTasks" class="panel-card import-task-card" shadow="never">
        <template #header>最近导入结果</template>
        <EmptyState v-if="!importTaskPage.records.length" title="暂无导入结果" description="导入完成后会在这里展示成功、失败和错误报告入口。" />
        <template v-else>
          <el-table :data="importTaskPage.records" row-key="id">
            <el-table-column prop="id" label="任务 ID" width="90" />
            <el-table-column prop="fileName" label="文件名" min-width="220" show-overflow-tooltip />
            <el-table-column label="状态" width="130">
              <template #default="{ row }">
                <el-tag :type="getTaskStatusType(row)">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="totalRows" label="总数" width="80" />
            <el-table-column prop="successRows" label="成功" width="80" />
            <el-table-column prop="failedRows" label="失败" width="80" />
            <el-table-column prop="createdAt" label="创建时间" min-width="160" />
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click.stop="selectImportTask(row)">{{ row.failedRows ? '查看错误' : '查看' }}</el-button>
                <el-button v-if="row.failedRows" size="small" :icon="Download" @click.stop="downloadErrorReport(row)">报告</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="importTaskPage.total > importTaskPage.size" class="pagination-row">
            <el-pagination
              background
              layout="total, prev, pager, next"
              :current-page="Number(importTaskPage.page)"
              :page-size="Number(importTaskPage.size)"
              :total="Number(importTaskPage.total)"
              @current-change="handleTaskPageChange"
            />
          </div>
        </template>
      </el-card>
    </div>

    <el-card v-if="importTask?.failedRows" class="panel-card mt-16" shadow="never">
      <template #header>错误明细：任务 #{{ importTask.id }}</template>
      <EmptyState v-if="errorPage.records.length === 0" title="暂无错误明细" />
      <template v-else>
        <el-table :data="errorPage.records">
          <el-table-column prop="rowNo" label="行号" width="90" />
          <el-table-column prop="wordText" label="单词" min-width="140" />
          <el-table-column prop="errorCode" label="错误码" min-width="140" />
          <el-table-column prop="errorMessage" label="错误原因" min-width="260" show-overflow-tooltip />
        </el-table>
        <div class="pagination-row">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :current-page="Number(errorPage.page)"
            :page-size="Number(errorPage.size)"
            :total="Number(errorPage.total)"
            @current-change="handleErrorPageChange"
          />
        </div>
      </template>
    </el-card>
  </section>
</template>

<style scoped>
.import-task-card {
  grid-column: 1 / -1;
}
</style>
