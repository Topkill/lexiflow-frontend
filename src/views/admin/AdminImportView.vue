<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Refresh, Upload } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  downloadWordImportErrorReport,
  downloadWordImportTemplate,
  fetchAdminWordbooks,
  fetchWordImportErrors,
  importAdminWords,
  importAdminWordsFromJsonUrl,
} from '../../api/admin'

const loadingWordbooks = ref(false)
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
    if (importTask.value.failedRows) {
      ElMessage.warning(`导入完成，${importTask.value.failedRows} 行失败`)
    } else {
      ElMessage.success('导入完成')
    }
    resetUploadFile()
    await loadWordbooks()
    await loadErrors(1)
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
    if (importTask.value.failedRows) {
      ElMessage.warning(`JSON 导入完成，${importTask.value.failedRows} 行失败`)
    } else {
      ElMessage.success('JSON 导入完成')
    }
    await loadWordbooks()
    await loadErrors(1)
  } finally {
    importingJson.value = false
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
    <PageHeader title="单词导入" subtitle="支持模板 Excel 上传，也支持从 JSON URL 导入词库单词">
      <el-button :icon="Refresh" @click="loadWordbooks">刷新词库</el-button>
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
