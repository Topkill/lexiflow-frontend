<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CirclePlus, Delete, Edit, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createAdminWord, fetchAdminWordbooks, fetchAdminWords, removeAdminWord, updateAdminWord } from '../../api/admin'

const route = useRoute()
const loadingWordbooks = ref(false)
const loadingWords = ref(false)
const saving = ref(false)
const removingId = ref('')
const wordbooks = ref([])
const selectedWordbookId = ref('')
const keyword = ref('')
const dialogVisible = ref(false)
const editingWord = ref(null)
const formRef = ref(null)
const page = ref({ records: [], total: 0, page: 1, size: 20 })

const selectedWordbook = computed(() => wordbooks.value.find((item) => item.id === selectedWordbookId.value))
const dialogTitle = computed(() => (editingWord.value ? '编辑单词' : '新增单词'))

const form = reactive({
  word: '',
  phonetic0: '',
  phonetic1: '',
  trans: '',
  sentences: '',
  phrases: '',
  synos: '',
  relWords: '',
  etymology: '',
  primaryPos: '',
  primaryDefinition: '',
  tags: '',
  sequenceNo: 1,
  difficultyLevel: 2,
  examFrequency: 0,
  enabled: true,
})

const rules = {
  word: [{ required: true, message: '请输入英文单词', trigger: 'blur' }],
  trans: [{ required: true, message: '请输入释义 JSON', trigger: 'blur' }],
  sequenceNo: [{ required: true, message: '请输入词库顺序', trigger: 'blur' }],
  difficultyLevel: [{ required: true, message: '请选择难度', trigger: 'blur' }],
  examFrequency: [{ required: true, message: '请输入考频', trigger: 'blur' }],
}

function prettyJson(value, fallback = '') {
  if (!value) return fallback
  try {
    return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2)
  } catch {
    return String(value)
  }
}

function compactJson(value) {
  if (!value?.trim()) return null
  return JSON.stringify(JSON.parse(value))
}

function firstSentence(row) {
  try {
    const sentences = typeof row.sentences === 'string' ? JSON.parse(row.sentences) : row.sentences
    return Array.isArray(sentences) && sentences[0]?.c ? sentences[0].c : ''
  } catch {
    return ''
  }
}

async function loadWordbooks() {
  loadingWordbooks.value = true
  try {
    const result = await fetchAdminWordbooks({ page: 1, size: 100 })
    wordbooks.value = result.records || []
    const queryWordbookId = route.query.wordbookId ? String(route.query.wordbookId) : ''
    selectedWordbookId.value = wordbooks.value.some((item) => item.id === queryWordbookId)
      ? queryWordbookId
      : wordbooks.value[0]?.id || ''
    if (selectedWordbookId.value) {
      await loadWords()
    }
  } finally {
    loadingWordbooks.value = false
  }
}

async function loadWords() {
  if (!selectedWordbookId.value) {
    page.value = { records: [], total: 0, page: 1, size: page.value.size }
    return
  }
  loadingWords.value = true
  try {
    const params = { page: page.value.page, size: page.value.size }
    if (keyword.value.trim()) {
      params.keyword = keyword.value.trim()
    }
    page.value = await fetchAdminWords(selectedWordbookId.value, params)
  } finally {
    loadingWords.value = false
  }
}

async function handleWordbookChange() {
  page.value = { ...page.value, page: 1 }
  await loadWords()
}

async function searchWords() {
  page.value = { ...page.value, page: 1 }
  await loadWords()
}

async function handlePageChange(currentPage) {
  page.value = { ...page.value, page: currentPage }
  await loadWords()
}

async function handleSizeChange(size) {
  page.value = { ...page.value, page: 1, size }
  await loadWords()
}

function resetForm() {
  const nextSequenceNo = (selectedWordbook.value?.wordCount || 0) + 1
  Object.assign(form, {
    word: '',
    phonetic0: '',
    phonetic1: '',
    trans: '[\n  {\n    "pos": "",\n    "cn": ""\n  }\n]',
    sentences: '',
    phrases: '',
    synos: '',
    relWords: '',
    etymology: '',
    primaryPos: '',
    primaryDefinition: '',
    tags: '',
    sequenceNo: nextSequenceNo,
    difficultyLevel: 2,
    examFrequency: 0,
    enabled: true,
  })
}

function openCreateDialog() {
  editingWord.value = null
  resetForm()
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEditDialog(row) {
  editingWord.value = row
  Object.assign(form, {
    word: row.word || '',
    phonetic0: row.phonetic0 || '',
    phonetic1: row.phonetic1 || '',
    trans: prettyJson(row.trans, '[\n  {\n    "pos": "",\n    "cn": ""\n  }\n]'),
    sentences: prettyJson(row.sentences),
    phrases: prettyJson(row.phrases),
    synos: prettyJson(row.synos),
    relWords: prettyJson(row.relWords),
    etymology: prettyJson(row.etymology),
    primaryPos: row.primaryPos || '',
    primaryDefinition: row.primaryDefinition || '',
    tags: row.tags || '',
    sequenceNo: row.sequenceNo || 1,
    difficultyLevel: row.difficultyLevel || 2,
    examFrequency: row.examFrequency || 0,
    enabled: row.enabled ?? true,
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function buildPayload() {
  return {
    word: form.word.trim(),
    phonetic0: form.phonetic0?.trim() || null,
    phonetic1: form.phonetic1?.trim() || null,
    trans: compactJson(form.trans),
    sentences: compactJson(form.sentences),
    phrases: compactJson(form.phrases),
    synos: compactJson(form.synos),
    relWords: compactJson(form.relWords),
    etymology: compactJson(form.etymology),
    primaryPos: form.primaryPos?.trim() || null,
    primaryDefinition: form.primaryDefinition?.trim() || null,
    tags: form.tags?.trim() || null,
    sequenceNo: form.sequenceNo,
    difficultyLevel: form.difficultyLevel,
    examFrequency: form.examFrequency,
    enabled: form.enabled,
  }
}

async function submitForm() {
  await formRef.value?.validate()
  try {
    buildPayload()
  } catch {
    ElMessage.warning('请检查 JSON 字段格式')
    return
  }
  saving.value = true
  try {
    if (editingWord.value) {
      await updateAdminWord(selectedWordbookId.value, editingWord.value.id, buildPayload())
      ElMessage.success('单词已更新')
    } else {
      await createAdminWord(selectedWordbookId.value, buildPayload())
      ElMessage.success('单词已新增')
    }
    dialogVisible.value = false
    await loadWords()
  } finally {
    saving.value = false
  }
}

async function removeWord(row) {
  await ElMessageBox.confirm(`确定从当前词库移除「${row.word}」吗？`, '移除单词', {
    confirmButtonText: '移除',
    cancelButtonText: '取消',
    type: 'warning',
  })
  removingId.value = row.id
  try {
    await removeAdminWord(selectedWordbookId.value, row.id)
    ElMessage.success('单词已移除')
    await loadWords()
  } finally {
    removingId.value = ''
  }
}

onMounted(loadWordbooks)
</script>

<template>
  <section>
    <PageHeader title="单词管理" subtitle="按词库维护单词释义、例句和顺序">
      <el-button :icon="Refresh" @click="loadWords">刷新</el-button>
      <el-button type="primary" :icon="CirclePlus" :disabled="!selectedWordbookId" @click="openCreateDialog">新增单词</el-button>
    </PageHeader>

    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-select
          v-model="selectedWordbookId"
          class="filter-grow"
          filterable
          placeholder="选择词库"
          :loading="loadingWordbooks"
          @change="handleWordbookChange"
        >
          <el-option v-for="book in wordbooks" :key="book.id" :label="`${book.name} (${book.wordCount || 0})`" :value="book.id" />
        </el-select>
        <el-input v-model.trim="keyword" class="filter-grow" clearable placeholder="搜索单词或释义" @keyup.enter="searchWords" />
        <el-button :icon="Search" @click="searchWords">搜索</el-button>
      </div>

      <el-skeleton v-if="loadingWords" :rows="6" animated />
      <EmptyState v-else-if="wordbooks.length === 0" title="暂无词库" description="先在词库管理中创建词库，再维护单词。" />
      <EmptyState v-else-if="page.records.length === 0" title="暂无单词">
        <el-button type="primary" :icon="CirclePlus" @click="openCreateDialog">新增单词</el-button>
      </EmptyState>
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="sequenceNo" label="顺序" width="90" />
          <el-table-column prop="word" label="单词" min-width="150" />
          <el-table-column prop="primaryPos" label="词性" width="90" />
          <el-table-column prop="primaryDefinition" label="主释义" min-width="220" show-overflow-tooltip />
          <el-table-column label="例句" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">{{ firstSentence(row) }}</template>
          </el-table-column>
          <el-table-column prop="difficultyLevel" label="难度" width="80" />
          <el-table-column prop="examFrequency" label="考频" width="80" />
          <el-table-column prop="enabled" label="启用" width="90">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button text :icon="Edit" @click="openEditDialog(row)">编辑</el-button>
              <el-button text type="danger" :icon="Delete" :loading="removingId === row.id" @click="removeWord(row)">移除</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="720px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <div class="form-two-col">
          <el-form-item label="英文单词" prop="word">
            <el-input v-model.trim="form.word" placeholder="ability" />
          </el-form-item>
        </div>
        <div class="form-two-col">
          <el-form-item label="音标 0">
            <el-input v-model.trim="form.phonetic0" placeholder="əˈbɪləti" />
          </el-form-item>
          <el-form-item label="音标 1">
            <el-input v-model.trim="form.phonetic1" />
          </el-form-item>
        </div>
        <div class="form-two-col">
          <el-form-item label="主要词性">
            <el-input v-model.trim="form.primaryPos" placeholder="n." />
          </el-form-item>
          <el-form-item label="主释义">
            <el-input v-model.trim="form.primaryDefinition" placeholder="能力；才能" />
          </el-form-item>
        </div>
        <el-form-item label="释义 JSON" prop="trans">
          <el-input v-model="form.trans" type="textarea" :rows="5" placeholder='[{"pos":"n.","cn":"能力；才能"}]' />
        </el-form-item>
        <el-form-item label="例句 JSON">
          <el-input v-model="form.sentences" type="textarea" :rows="4" placeholder='[{"c":"Example sentence.","cn":"例句翻译。"}]' />
        </el-form-item>
        <el-form-item label="短语 JSON">
          <el-input v-model="form.phrases" type="textarea" :rows="3" placeholder='[{"c":"take off","cn":"起飞；脱下"}]' />
        </el-form-item>
        <el-form-item label="同近义词 JSON">
          <el-input v-model="form.synos" type="textarea" :rows="3" placeholder='[{"pos":"v.","cn":"取消","ws":["recall"]}]' />
        </el-form-item>
        <el-form-item label="相关词 JSON">
          <el-input v-model="form.relWords" type="textarea" :rows="3" placeholder='{"root":"cancel","rels":[]}' />
        </el-form-item>
        <el-form-item label="词源 JSON">
          <el-input v-model="form.etymology" type="textarea" :rows="3" placeholder='[{"t":"词源标题","d":"词源说明"}]' />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model.trim="form.tags" placeholder="高频,核心" />
        </el-form-item>
        <div class="form-two-col">
          <el-form-item label="词库顺序" prop="sequenceNo">
            <el-input-number v-model="form.sequenceNo" :min="1" />
          </el-form-item>
          <el-form-item label="难度" prop="difficultyLevel">
            <el-input-number v-model="form.difficultyLevel" :min="1" :max="5" />
          </el-form-item>
        </div>
        <div class="form-two-col">
          <el-form-item label="考频" prop="examFrequency">
            <el-input-number v-model="form.examFrequency" :min="0" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>
