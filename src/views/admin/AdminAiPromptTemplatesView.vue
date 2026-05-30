<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, Edit, Plus, Refresh, Select, View } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  bindAdminAiPromptFeature,
  copyAdminAiPromptTemplate,
  copyBuiltinAdminAiPromptTemplate,
  createAdminAiPromptTemplate,
  deleteAdminAiPromptTemplate,
  fetchAdminAiPromptGroups,
  fetchAdminWordbooks,
  updateAdminAiPromptTemplate,
} from '../../api/admin'

const loading = ref(false)
const saving = ref(false)
const operatingKey = ref('')
const groups = ref([])
const wordbooks = ref([])
const activeFeatureType = ref('')
const scopeWordbookId = ref('0')
const drawerVisible = ref(false)
const detailVisible = ref(false)
const detailTemplate = ref(null)
const editingTemplate = ref(null)
const formRef = ref()

const form = reactive({
  featureType: '',
  wordbookId: '0',
  name: '',
  systemPrompt: '',
  instructionPrompt: '',
  outputSchemaJson: '',
  userPromptText: '',
  enabled: true,
})

const defaultOutputSchemas = {
  WORD_QA: {
    answer: '',
    keyPoints: [],
    relatedWords: [],
    followUps: [],
    grammarTip: '',
  },
  CLOZE_QUIZ: {
    title: '',
    passage: '',
    passageZh: '',
    explanations: [
      {
        word: '',
        usedForm: '',
        usedPos: '',
        definitionZh: '',
        reasonZh: '',
      },
    ],
  },
  CLOZE_REVIEW: {
    overall: '',
    mistakeTags: [],
    strengths: [],
    weaknesses: [
      {
        tag: '',
        blankNos: [],
        comment: '',
      },
    ],
    suggestions: [],
    blankReviews: [
      {
        blankNo: 0,
        comment: '',
        tip: '',
      },
    ],
    grammarTip: '',
  },
}

const requiredOutputSchemaRules = {
  WORD_QA: [
    { key: 'answer', type: 'string' },
    { key: 'keyPoints', type: 'array' },
    { key: 'relatedWords', type: 'array' },
    { key: 'followUps', type: 'array' },
    { key: 'grammarTip', type: 'string' },
  ],
  CLOZE_QUIZ: [
    { key: 'title', type: 'string' },
    { key: 'passage', type: 'string' },
    { key: 'passageZh', type: 'string' },
    { key: 'explanations', type: 'array', itemFields: ['word', 'usedForm', 'usedPos', 'definitionZh', 'reasonZh'] },
  ],
  CLOZE_REVIEW: [
    { key: 'overall', type: 'string' },
    { key: 'mistakeTags', type: 'array' },
    { key: 'strengths', type: 'array' },
    { key: 'weaknesses', type: 'array', itemFields: ['tag', 'blankNos', 'comment'] },
    { key: 'suggestions', type: 'array' },
    { key: 'blankReviews', type: 'array', itemFields: ['blankNo', 'comment', 'tip'] },
    { key: 'grammarTip', type: 'string' },
  ],
}

const rules = {
  featureType: [{ required: true, message: '请选择 AI 功能', trigger: 'change' }],
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  systemPrompt: [{ required: true, message: '请输入系统提示词', trigger: 'blur' }],
  userPromptText: [{ required: true, message: '请输入用户提示词', trigger: 'blur' }],
  enabled: [{ required: true, message: '请选择启用状态', trigger: 'change' }],
}

const activeGroup = computed(() => groups.value.find((group) => group.featureType === activeFeatureType.value) || groups.value[0] || null)
const scopeLabel = computed(() => {
  if (String(scopeWordbookId.value) === '0') return '全部词书'
  const wordbook = wordbooks.value.find((item) => String(item.id) === String(scopeWordbookId.value))
  return wordbook ? wordbookScopeLabel(wordbook.id) : `词书 #${scopeWordbookId.value}`
})

function wordbookScopeLabel(wordbookId) {
  if (String(wordbookId || '0') === '0') return '全部词书'
  const wordbook = wordbooks.value.find((item) => String(item.id) === String(wordbookId))
  return wordbook ? `${wordbook.name} / ${wordbook.type}` : `词书 #${wordbookId}`
}

function featureLabel(featureType) {
  return groups.value.find((group) => group.featureType === featureType)?.featureLabel || featureType
}

function resetForm() {
  editingTemplate.value = null
  const featureType = activeGroup.value?.featureType || groups.value[0]?.featureType || ''
  Object.assign(form, {
    featureType,
    wordbookId: scopeWordbookId.value || '0',
    name: '',
    systemPrompt: '',
    instructionPrompt: '',
    outputSchemaJson: getDefaultOutputSchemaJson(featureType),
    userPromptText: buildUserPromptText('', getDefaultOutputSchemaJson(featureType), featureType),
    enabled: true,
  })
  formRef.value?.clearValidate()
}

async function loadData() {
  loading.value = true
  try {
    const [groupData, wordbookPage] = await Promise.all([
      fetchAdminAiPromptGroups({ wordbookId: Number(scopeWordbookId.value || 0) }),
      fetchAdminWordbooks({ page: 1, size: 100, enabled: true }),
    ])
    groups.value = groupData
    wordbooks.value = wordbookPage.records || []
    if (!activeFeatureType.value && groups.value.length) {
      activeFeatureType.value = groups.value[0].featureType
    }
    if (activeFeatureType.value && !groups.value.some((group) => group.featureType === activeFeatureType.value) && groups.value.length) {
      activeFeatureType.value = groups.value[0].featureType
    }
  } finally {
    loading.value = false
  }
}

async function handleScopeChange() {
  if (drawerVisible.value && !editingTemplate.value) {
    form.wordbookId = scopeWordbookId.value || '0'
  }
  await loadData()
}

function statusLabel(group) {
  if (group.activeTemplateId) return '自定义中'
  if (group.inheritedTemplate) return '继承中'
  return '默认中'
}

function statusType(group) {
  if (group.activeTemplateId) return 'success'
  if (group.inheritedTemplate) return 'warning'
  return 'info'
}

function displayedBaseTemplate(group) {
  return group.inheritedTemplate || group.builtinTemplate
}

function templateOperationKey(row) {
  return row?.templateKey || (row?.id ? `template:${row.id}` : '')
}

function restoreOperationKey(group) {
  return `${group?.featureType || 'prompt'}:${scopeWordbookId.value || '0'}:restore`
}

function openCreate() {
  resetForm()
  drawerVisible.value = true
}

function openCreateForFeature(featureType) {
  activeFeatureType.value = featureType
  resetForm()
  drawerVisible.value = true
}

function openEdit(row) {
  editingTemplate.value = row
  Object.assign(form, {
    featureType: row.featureType,
    wordbookId: row.wordbookId || scopeWordbookId.value || '0',
    name: row.name || '',
    systemPrompt: row.systemPrompt || '',
    instructionPrompt: row.instructionPrompt || '',
    outputSchemaJson: outputSchemaPreview(row.outputSchemaJson, row.featureType),
    userPromptText: buildUserPromptText(row.instructionPrompt || '', outputSchemaPreview(row.outputSchemaJson, row.featureType), row.featureType),
    enabled: row.enabled ?? true,
  })
  drawerVisible.value = true
}

function openDetail(row) {
  detailTemplate.value = row
  detailVisible.value = true
}

async function submitForm() {
  await formRef.value?.validate()
  let outputSchemaJson = ''
  let instructionPrompt = ''
  try {
    const parsed = parseUserPromptText(form.userPromptText)
    instructionPrompt = parsed.instructionPrompt
    outputSchemaJson = buildOutputSchemaJson(parsed.outputSchemaJson)
  } catch (error) {
    ElMessage.warning(error.message || '用户提示词或输出 JSON 结构不正确')
    return
  }
  saving.value = true
  try {
    const payload = {
      featureType: form.featureType,
      wordbookId: Number(editingTemplate.value ? form.wordbookId || 0 : scopeWordbookId.value || 0),
      name: form.name.trim(),
      systemPrompt: form.systemPrompt.trim(),
      instructionPrompt,
      outputSchemaJson,
      enabled: form.enabled,
    }
    if (editingTemplate.value?.id) {
      await updateAdminAiPromptTemplate(editingTemplate.value.id, payload)
      ElMessage.success('提示词模板已更新')
    } else {
      await createAdminAiPromptTemplate(payload)
      ElMessage.success('提示词模板已创建')
    }
    drawerVisible.value = false
    await loadData()
  } finally {
    saving.value = false
  }
}

async function copyTemplate(row) {
  operatingKey.value = templateOperationKey(row)
  try {
    if (row.builtIn) {
      await copyBuiltinAdminAiPromptTemplate(row.featureType, { wordbookId: Number(scopeWordbookId.value || 0) })
    } else {
      await copyAdminAiPromptTemplate(row.id, { wordbookId: Number(scopeWordbookId.value || 0) })
    }
    ElMessage.success('已复制为新模板副本')
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

async function activateTemplate(group, row) {
  operatingKey.value = templateOperationKey(row)
  try {
    await bindAdminAiPromptFeature(group.featureType, {
      wordbookId: Number(scopeWordbookId.value || 0),
      templateId: row.id ? Number(row.id) : null,
    })
    ElMessage.success(row.id ? '已设为当前使用模板' : '已恢复默认提示词')
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

async function restoreDefault(group) {
  if (!group) return
  operatingKey.value = restoreOperationKey(group)
  try {
    await bindAdminAiPromptFeature(group.featureType, {
      wordbookId: Number(scopeWordbookId.value || 0),
      templateId: null,
    })
    ElMessage.success(String(scopeWordbookId.value) === '0' ? '已恢复默认提示词' : '已取消本词书专用提示词')
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

function outputSchemaPreview(outputSchemaJson, featureType) {
  return JSON.stringify(parseOutputSchema(outputSchemaJson, featureType), null, 2)
}

function parseOutputSchema(outputSchemaJson, featureType) {
  try {
    const parsed = typeof outputSchemaJson === 'string' ? JSON.parse(outputSchemaJson) : outputSchemaJson
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return enrichOutputSchema(parsed, featureType)
    }
  } catch {
    // 使用默认结构兜底。
  }
  return cloneJson(defaultOutputSchemas[featureType] || {})
}

function enrichOutputSchema(schema, featureType) {
  const normalized = cloneJson(schema)
  if ((featureType === 'WORD_QA' || featureType === 'CLOZE_REVIEW')
      && !Object.prototype.hasOwnProperty.call(normalized, 'grammarTip')) {
    normalized.grammarTip = ''
  }
  return normalized
}

function getDefaultOutputSchemaJson(featureType) {
  const group = groups.value.find((item) => item.featureType === featureType)
  const template = group ? displayedBaseTemplate(group) : null
  return outputSchemaPreview(template?.outputSchemaJson, featureType)
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function handleFeatureChange(featureType) {
  if (!editingTemplate.value) {
    form.outputSchemaJson = getDefaultOutputSchemaJson(featureType)
    form.userPromptText = buildUserPromptText('', form.outputSchemaJson, featureType)
  }
}

function buildOutputSchemaJson(outputSchemaJson) {
  const schema = parseJsonObject(outputSchemaJson)
  validateOutputSchema(schema, form.featureType)
  return JSON.stringify(schema, null, 2)
}

function buildUserPromptText(instructionPrompt, outputSchemaJson, featureType = form.featureType) {
  const text = String(instructionPrompt || '').trim()
  const schema = outputSchemaPreview(outputSchemaJson, featureType)
  return text ? `${text}\n\n输出 JSON 结构：\n${schema}` : `输出 JSON 结构：\n${schema}`
}

function parseUserPromptText(text) {
  const value = String(text || '').trim()
  if (!value) {
    throw new Error('用户提示词不能为空')
  }
  const jsonStart = findLastJsonObjectStart(value)
  if (jsonStart < 0) {
    throw new Error('用户提示词末尾必须包含输出 JSON 结构')
  }
  const instructionPrompt = value.slice(0, jsonStart)
    .replace(/\s*输出\s*JSON\s*结构[:：]?\s*$/i, '')
    .trim()
  if (!instructionPrompt) {
    throw new Error('用户提示词正文不能为空')
  }
  return {
    instructionPrompt,
    outputSchemaJson: value.slice(jsonStart).trim(),
  }
}

function findLastJsonObjectStart(text) {
  for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
    try {
      const parsed = JSON.parse(text.slice(index))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return index
      }
    } catch {
      // 继续向前寻找完整 JSON 对象。
    }
  }
  return -1
}

function parseJsonObject(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('输出 JSON 结构不是合法 JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('输出 JSON 结构必须是对象')
  }
  if (!Object.keys(parsed).length) {
    throw new Error('输出 JSON 结构不能为空')
  }
  for (const key of Object.keys(parsed)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
      throw new Error('输出 JSON 字段名只能使用字母、数字和下划线，且必须以字母开头')
    }
  }
  return parsed
}

function validateOutputSchema(schema, featureType) {
  const rules = requiredOutputSchemaRules[featureType] || []
  for (const rule of rules) {
    if (!Object.prototype.hasOwnProperty.call(schema, rule.key)) {
      throw new Error(`输出结构缺少字段：${rule.key}`)
    }
    if (!matchesJsonType(schema[rule.key], rule.type)) {
      throw new Error(`字段 ${rule.key} 的 JSON 类型不正确`)
    }
    if (rule.itemFields?.length) {
      validateArrayItemFields(rule, schema[rule.key])
    }
  }
}

function matchesJsonType(value, type) {
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number'
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'object') return value && typeof value === 'object' && !Array.isArray(value)
  return true
}

function validateArrayItemFields(rule, value) {
  if (!Array.isArray(value) || !value.length || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) {
    throw new Error(`字段 ${rule.key} 必须提供数组元素对象示例`)
  }
  for (const field of rule.itemFields) {
    if (!Object.prototype.hasOwnProperty.call(value[0], field)) {
      throw new Error(`字段 ${rule.key} 的数组元素缺少字段：${field}`)
    }
  }
}

async function removeTemplate(row) {
  if (!row?.id) return
  await ElMessageBox.confirm(`确认删除提示词模板「${row.name}」？删除后不可恢复。`, '删除提示词模板', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
  })
  operatingKey.value = templateOperationKey(row)
  try {
    await deleteAdminAiPromptTemplate(row.id)
    ElMessage.success('提示词模板已删除')
    if (detailTemplate.value?.id === row.id) {
      detailVisible.value = false
      detailTemplate.value = null
    }
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="AI 提示词管理" subtitle="按功能和词书范围维护提示词模板">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增模板</el-button>
    </PageHeader>

    <div class="scope-bar">
      <span class="scope-label">生效词书</span>
      <el-select v-model="scopeWordbookId" class="scope-select" filterable @change="handleScopeChange">
        <el-option label="全部词书" value="0" />
        <el-option v-for="wordbook in wordbooks" :key="wordbook.id" :label="wordbookScopeLabel(wordbook.id)" :value="String(wordbook.id)" />
      </el-select>
    </div>

    <el-skeleton v-if="loading" :rows="8" animated />
    <EmptyState v-else-if="groups.length === 0" title="暂无 AI 提示词模板" description="后端会提供 3 个功能的默认提示词作为只读兜底。">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增模板</el-button>
    </EmptyState>
    <el-tabs v-else v-model="activeFeatureType" class="prompt-tabs">
      <el-tab-pane v-for="group in groups" :key="group.featureType" :name="group.featureType">
        <template #label>
          <span>{{ group.featureLabel }}</span>
          <el-tag class="tab-tag" size="small" :type="statusType(group)">
            {{ statusLabel(group) }}
          </el-tag>
        </template>

        <el-card class="panel-card prompt-panel" shadow="never">
          <div class="prompt-section-header">
            <div>
              <strong>{{ group.inheritedTemplate ? '继承提示词' : '默认提示词' }}</strong>
              <p v-if="group.inheritedTemplate">当前范围：{{ scopeLabel }}。没有专用模板时继承全部词书模板。</p>
              <p v-else>当前范围：{{ scopeLabel }}。没有自定义模板时使用后端内置兜底。</p>
            </div>
            <div class="admin-table-actions">
              <el-button size="small" plain :icon="CopyDocument" @click="copyTemplate(displayedBaseTemplate(group))">复制副本</el-button>
              <el-button
                v-if="group.activeTemplateId"
                size="small"
                plain
                type="warning"
                :icon="Select"
                :loading="operatingKey === restoreOperationKey(group)"
                @click="restoreDefault(group)"
              >
                {{ String(scopeWordbookId) === '0' ? '恢复默认' : '取消专用' }}
              </el-button>
              <el-tag v-else :type="group.inheritedTemplate ? 'warning' : 'success'">{{ group.inheritedTemplate ? '继承使用' : '当前使用' }}</el-tag>
            </div>
          </div>

          <el-alert
            v-if="group.inheritedTemplate"
            class="mb-16"
            type="warning"
            :closable="false"
            show-icon
            :title="`当前继承全部词书模板：${group.inheritedTemplate.name}`"
          />

          <div class="prompt-readonly-grid">
            <div class="prompt-readonly-block">
              <span class="prompt-readonly-label">系统提示词</span>
              <el-input :model-value="displayedBaseTemplate(group).systemPrompt" type="textarea" :rows="4" readonly />
            </div>
            <div class="prompt-readonly-block">
              <span class="prompt-readonly-label">用户提示词</span>
              <el-input :model-value="buildUserPromptText(displayedBaseTemplate(group).instructionPrompt, displayedBaseTemplate(group).outputSchemaJson, group.featureType)" type="textarea" :rows="18" readonly />
            </div>
          </div>
        </el-card>

        <el-card class="panel-card mt-16" shadow="never">
          <div class="prompt-section-header">
            <div>
              <strong>自定义模板</strong>
              <p>仅对「{{ scopeLabel }}」生效，可直接写专用提示词。</p>
            </div>
            <el-button type="primary" :icon="Plus" @click="openCreateForFeature(group.featureType)">新增本功能模板</el-button>
          </div>

          <el-table v-if="group.templates.length" :data="group.templates">
            <el-table-column prop="name" label="模板名称" min-width="180" />
            <el-table-column prop="enabled" label="启用" width="90">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="active" label="当前" width="100">
              <template #default="{ row }">
                <el-tag :type="row.active ? 'success' : 'info'">{{ row.active ? '当前使用' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="来源" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.sourceBuiltinKey || (row.sourceTemplateId ? `#${row.sourceTemplateId}` : '-') }}
              </template>
            </el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" width="180" />
            <el-table-column label="操作" width="380">
              <template #default="{ row }">
                <div class="admin-table-actions">
                  <el-button size="small" text type="primary" :icon="View" @click="openDetail(row)">查看</el-button>
                  <el-button size="small" text type="primary" :icon="Edit" :disabled="!row.editable" @click="openEdit(row)">编辑</el-button>
                  <el-button size="small" text type="primary" :icon="CopyDocument" :loading="operatingKey === templateOperationKey(row)" @click="copyTemplate(row)">复制副本</el-button>
                  <el-button
                    size="small"
                    text
                    type="danger"
                    :icon="Delete"
                    :loading="operatingKey === templateOperationKey(row)"
                    :disabled="row.active"
                    @click="removeTemplate(row)"
                  >
                    删除
                  </el-button>
                  <el-button
                    v-if="row.active"
                    size="small"
                    plain
                    type="warning"
                    :icon="Select"
                    :loading="operatingKey === restoreOperationKey(group)"
                    @click="restoreDefault(group)"
                  >
                    {{ String(scopeWordbookId) === '0' ? '恢复默认' : '取消专用' }}
                  </el-button>
                  <el-button
                    v-else
                    size="small"
                    plain
                    type="success"
                    :icon="Select"
                    :disabled="!row.enabled"
                    :loading="operatingKey === templateOperationKey(row)"
                    @click="activateTemplate(group, row)"
                  >
                    设为当前
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <EmptyState v-else title="暂无自定义模板" description="可以先复制当前展示提示词，或直接新增一套模板。" />
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="drawerVisible" :title="editingTemplate ? '编辑提示词模板' : '新增提示词模板'" size="760px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="AI 功能" prop="featureType">
          <el-select v-model="form.featureType" class="full-input" :disabled="Boolean(editingTemplate)" @change="handleFeatureChange">
            <el-option label="AI 问答" value="WORD_QA" />
            <el-option label="AI 完形填空" value="CLOZE_QUIZ" />
            <el-option label="AI 评阅" value="CLOZE_REVIEW" />
          </el-select>
        </el-form-item>
        <el-form-item label="生效词书">
          <el-input class="full-input" :model-value="wordbookScopeLabel(form.wordbookId)" disabled />
        </el-form-item>
        <el-form-item label="模板名称" prop="name">
          <el-input v-model.trim="form.name" maxlength="128" placeholder="例如：更自然的完形填空提示词" />
        </el-form-item>
        <el-form-item label="系统提示词" prop="systemPrompt">
          <el-input v-model="form.systemPrompt" type="textarea" :rows="5" maxlength="12000" show-word-limit />
        </el-form-item>
        <el-form-item prop="userPromptText">
          <template #label>
            <span>用户提示词</span>
            <span class="form-label-tip">末尾保留输出 JSON 结构，保存时会自动校验字段</span>
          </template>
          <el-input
            v-model="form.userPromptText"
            class="output-schema-json-editor"
            type="textarea"
            :rows="24"
            maxlength="32000"
            show-word-limit
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="启用" prop="enabled">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <div class="button-row">
          <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
          <el-button @click="drawerVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-drawer>

    <el-drawer v-model="detailVisible" title="提示词详情" size="720px">
      <EmptyState v-if="!detailTemplate" title="请选择模板" />
      <template v-else>
        <div class="prompt-detail-header">
          <div>
            <strong>{{ detailTemplate.name }}</strong>
            <p>{{ featureLabel(detailTemplate.featureType) }}</p>
          </div>
          <div class="admin-table-actions">
            <el-button size="small" plain :icon="CopyDocument" @click="copyTemplate(detailTemplate)">复制副本</el-button>
            <el-button
              v-if="!detailTemplate.builtIn"
              size="small"
              plain
              type="danger"
              :icon="Delete"
              :loading="operatingKey === templateOperationKey(detailTemplate)"
              :disabled="detailTemplate.active"
              @click="removeTemplate(detailTemplate)"
            >
              删除
            </el-button>
            <el-button
              v-if="detailTemplate.builtIn"
              size="small"
              plain
              type="warning"
              :icon="Select"
              :loading="operatingKey === restoreOperationKey(activeGroup || groups[0])"
              @click="restoreDefault(activeGroup || groups[0])"
            >
              {{ String(scopeWordbookId) === '0' ? '恢复默认' : '取消专用' }}
            </el-button>
          </div>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="生效词书">{{ wordbookScopeLabel(detailTemplate.wordbookId) }}</el-descriptions-item>
          <el-descriptions-item label="当前使用">{{ detailTemplate.active ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="是否启用">{{ detailTemplate.enabled ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ detailTemplate.sourceBuiltinKey || detailTemplate.sourceTemplateId || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="prompt-readonly-block mt-16">
          <span class="prompt-readonly-label">系统提示词</span>
          <el-input :model-value="detailTemplate.systemPrompt" type="textarea" :rows="5" readonly />
        </div>
        <div class="prompt-readonly-block mt-16">
          <span class="prompt-readonly-label">用户提示词</span>
          <el-input :model-value="buildUserPromptText(detailTemplate.instructionPrompt, detailTemplate.outputSchemaJson, detailTemplate.featureType)" type="textarea" :rows="20" readonly />
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.prompt-panel {
  margin-bottom: 0;
}

.prompt-section-header,
.prompt-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.prompt-section-header p,
.prompt-detail-header p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.prompt-readonly-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.prompt-readonly-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-readonly-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.scope-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.scope-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.scope-select {
  width: 280px;
}

.tab-tag {
  margin-left: 8px;
}

.mt-16 {
  margin-top: 16px;
}

.mb-16 {
  margin-bottom: 16px;
}

.output-schema-json-editor :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  line-height: 1.55;
}
</style>
