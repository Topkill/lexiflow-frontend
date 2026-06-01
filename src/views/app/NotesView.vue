<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, EditPen, Plus, Refresh, Search } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import StudyNoteDialog from '../../components/StudyNoteDialog.vue'
import { createNote, deleteNote, fetchNotes, updateNote } from '../../api/notes'

const SOURCE_LABELS = {
  NORMAL: '普通笔记',
  WORD_QA: 'AI 问答',
  CLOZE_REVIEW: 'AI 评阅',
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const loading = ref(false)
const deletingId = ref('')
const saving = ref(false)
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({
  keyword: '',
  sourceType: '',
  page: 1,
  size: 20,
})
const dialogVisible = ref(false)
const editingNote = ref(null)

const dialogTitle = computed(() => (editingNote.value?.noteId ? '编辑笔记' : '新建笔记'))
const dialogConfirmText = computed(() => (editingNote.value?.noteId ? '保存修改' : '创建笔记'))

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    keyword: filters.keyword || undefined,
    sourceType: filters.sourceType || undefined,
  }
}

async function loadData() {
  if (loading.value) return
  loading.value = true
  try {
    page.value = await fetchNotes(queryParams())
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

function openCreateDialog() {
  editingNote.value = {
    sourceType: 'NORMAL',
    title: '',
    quotedText: '',
    contentMd: '',
  }
  dialogVisible.value = true
}

function openEditDialog(row) {
  editingNote.value = { ...row }
  dialogVisible.value = true
}

async function submitNote(payload) {
  if (saving.value) return
  const base = editingNote.value || {}
  const request = {
    sourceType: base.sourceType || 'NORMAL',
    sourceId: base.sourceId || null,
    wordbookId: base.wordbookId || null,
    wordId: base.wordId || null,
    title: payload.title,
    quotedText: payload.quotedText,
    contentMd: payload.contentMd,
  }
  saving.value = true
  try {
    if (base.noteId) {
      await updateNote(base.noteId, request)
      ElMessage.success('笔记已更新')
    } else {
      await createNote(request)
      ElMessage.success('笔记已创建')
    }
    dialogVisible.value = false
    await loadData()
  } finally {
    saving.value = false
  }
}

async function removeNote(row) {
  if (deletingId.value) return
  try {
    await ElMessageBox.confirm('删除后不会影响原 AI 回答或评阅结果。', '删除笔记', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  deletingId.value = row.noteId
  try {
    await deleteNote(row.noteId)
    ElMessage.success('笔记已删除')
    await loadData()
  } finally {
    deletingId.value = ''
  }
}

function sourceLabel(sourceType) {
  return SOURCE_LABELS[sourceType] || sourceType || '未知来源'
}

function previewText(value, fallback = '暂无内容') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return fallback
  return text.length > 96 ? `${text.slice(0, 96)}...` : text
}

function renderContentPreview(value) {
  const text = String(value || '').trim()
  return text ? markdown.render(text.length > 240 ? `${text.slice(0, 240)}...` : text) : ''
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="笔记" subtitle="保存普通学习笔记、AI 问答摘录和完形评阅摘录">
      <el-button :icon="Refresh" :disabled="loading || Boolean(deletingId)" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Plus" :disabled="loading || Boolean(deletingId)" @click="openCreateDialog">新建笔记</el-button>
    </PageHeader>

    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-input
          v-model.trim="filters.keyword"
          class="filter-grow"
          clearable
          :prefix-icon="Search"
          placeholder="搜索标题、引用或正文"
          @keyup.enter="handleFilterChange"
          @clear="handleFilterChange"
        />
        <el-select v-model="filters.sourceType" clearable placeholder="全部来源" @change="handleFilterChange">
          <el-option label="普通笔记" value="NORMAL" />
          <el-option label="AI 问答" value="WORD_QA" />
          <el-option label="AI 评阅" value="CLOZE_REVIEW" />
        </el-select>
        <el-button :icon="Search" :disabled="loading" @click="handleFilterChange">搜索</el-button>
      </div>

      <el-skeleton v-if="loading" :rows="6" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无笔记" description="可以新建普通笔记，也可以在 AI 回答或评阅里保存摘录。" />
      <template v-else>
        <div class="study-note-list">
          <article v-for="note in page.records" :key="note.noteId" class="study-note-item">
            <div class="study-note-item-main">
              <div class="study-note-item-head">
                <h2>{{ note.title || sourceLabel(note.sourceType) }}</h2>
                <el-tag effect="plain">{{ sourceLabel(note.sourceType) }}</el-tag>
              </div>
              <blockquote v-if="note.quotedText" class="study-note-quote">{{ previewText(note.quotedText) }}</blockquote>
              <div v-if="note.contentMd" class="study-note-content-preview" v-html="renderContentPreview(note.contentMd)"></div>
              <p v-else class="muted">只有引用快照，尚未填写自己的笔记。</p>
              <div class="study-note-meta">
                <span>{{ note.updatedAt || note.createdAt }}</span>
                <span v-if="note.wordbookId">词库 {{ note.wordbookId }}</span>
                <span v-if="note.wordId">单词 {{ note.wordId }}</span>
              </div>
            </div>
            <div class="study-note-actions">
              <el-button text :icon="EditPen" :disabled="Boolean(deletingId)" @click="openEditDialog(note)">编辑</el-button>
              <el-button text type="danger" :icon="Delete" :loading="deletingId === note.noteId" :disabled="Boolean(deletingId)" @click="removeNote(note)">删除</el-button>
            </div>
          </article>
        </div>
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

    <StudyNoteDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :confirm-text="dialogConfirmText"
      :initial-note="editingNote || {}"
      :saving="saving"
      @submit="submitNote"
    />
  </section>
</template>
