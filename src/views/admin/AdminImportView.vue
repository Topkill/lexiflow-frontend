<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh, Upload } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  downloadWordImportErrorReport,
  downloadWordImportTemplate,
  fetchAdminWordbooks,
  fetchWordImportErrors,
  importAdminWords,
} from '../../api/admin'

const loadingWordbooks = ref(false)
const uploading = ref(false)
const downloading = ref(false)
const selectedWordbookId = ref('')
const duplicateStrategy = ref('SKIP')
const wordbooks = ref([])
const selectedFile = ref(null)
const importTask = ref(null)
const errorPage = ref({ records: [], total: 0, page: 1, size: 20 })

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
    selectedWordbookId.value = selectedWordbookId.value || wordbooks.value[0]?.id || ''
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

async function submitImport() {
  if (!selectedWordbookId.value) {
    ElMessage.warning('请先选择词库')
    return
  }
  if (!selectedFile.value) {
    ElMessage.warning('请先选择 Excel 文件')
    return
  }
  uploading.value = true
  try {
    importTask.value = await importAdminWords(selectedWordbookId.value, duplicateStrategy.value, selectedFile.value)
    ElMessage.success('导入完成')
    selectedFile.value = null
    await loadErrors(1)
  } finally {
    uploading.value = false
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

async function downloadErrorReport() {
  if (!importTask.value?.id) return
  const response = await downloadWordImportErrorReport(importTask.value.id)
  saveBlob(response, `lexiflow-word-import-errors-${importTask.value.id}.xlsx`)
}

onMounted(loadWordbooks)
</script>

<template>
  <section>
    <PageHeader title="Excel 导入" subtitle="下载模板、上传词库单词并查看错误报告">
      <el-button :icon="Refresh" @click="loadWordbooks">刷新词库</el-button>
      <el-button :icon="Download" :loading="downloading" @click="downloadTemplate">下载模板</el-button>
    </PageHeader>

    <div class="work-grid">
      <el-card class="panel-card" shadow="never">
        <template #header>上传导入</template>
        <el-form label-position="top">
          <el-form-item label="目标词库">
            <el-select v-model="selectedWordbookId" class="full-input" filterable placeholder="选择词库" :loading="loadingWordbooks">
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
            <el-upload drag accept=".xlsx" :auto-upload="false" :limit="1" :on-change="handleFileChange" :on-remove="clearFile">
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
        <template #header>最近导入结果</template>
        <EmptyState v-if="!importTask" title="暂无导入结果" description="上传模板文件后会在这里展示成功、失败和错误报告入口。" />
        <template v-else>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="任务 ID">{{ importTask.id }}</el-descriptions-item>
            <el-descriptions-item label="文件名">{{ importTask.fileName }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="importTask.failedRows ? 'warning' : 'success'">{{ importTask.status }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="总行数">{{ importTask.totalRows }}</el-descriptions-item>
            <el-descriptions-item label="成功行数">{{ importTask.successRows }}</el-descriptions-item>
            <el-descriptions-item label="失败行数">{{ importTask.failedRows }}</el-descriptions-item>
          </el-descriptions>
          <div class="button-row mt-16">
            <el-button v-if="importTask.failedRows" :icon="Download" @click="downloadErrorReport">下载错误报告</el-button>
          </div>
        </template>
      </el-card>
    </div>

    <el-card v-if="importTask?.failedRows" class="panel-card mt-16" shadow="never">
      <template #header>错误明细</template>
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
