<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Edit, Plus, Refresh, Select, View } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  bindAdminAiPromptFeature,
  copyAdminAiPromptTemplate,
  copyBuiltinAdminAiPromptTemplate,
  createAdminAiPromptTemplate,
  fetchAdminAiPromptGroups,
  updateAdminAiPromptTemplate,
} from '../../api/admin'

const loading = ref(false)
const saving = ref(false)
const operatingKey = ref('')
const groups = ref([])
const activeFeatureType = ref('')
const drawerVisible = ref(false)
const detailVisible = ref(false)
const detailTemplate = ref(null)
const editingTemplate = ref(null)
const formRef = ref()

const form = reactive({
  featureType: '',
  name: '',
  systemPrompt: '',
  instructionPrompt: '',
  enabled: true,
})

const rules = {
  featureType: [{ required: true, message: '请选择 AI 功能', trigger: 'change' }],
  name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
  systemPrompt: [{ required: true, message: '请输入系统提示词', trigger: 'blur' }],
  instructionPrompt: [{ required: true, message: '请输入规则提示词', trigger: 'blur' }],
  enabled: [{ required: true, message: '请选择启用状态', trigger: 'change' }],
}

const activeGroup = computed(() => groups.value.find((group) => group.featureType === activeFeatureType.value) || groups.value[0] || null)

function featureLabel(featureType) {
  return groups.value.find((group) => group.featureType === featureType)?.featureLabel || featureType
}

function resetForm() {
  editingTemplate.value = null
  Object.assign(form, {
    featureType: activeGroup.value?.featureType || groups.value[0]?.featureType || '',
    name: '',
    systemPrompt: '',
    instructionPrompt: '',
    enabled: true,
  })
  formRef.value?.clearValidate()
}

async function loadData() {
  loading.value = true
  try {
    groups.value = await fetchAdminAiPromptGroups()
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
    name: row.name || '',
    systemPrompt: row.systemPrompt || '',
    instructionPrompt: row.instructionPrompt || '',
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
  saving.value = true
  try {
    const payload = {
      featureType: form.featureType,
      name: form.name.trim(),
      systemPrompt: form.systemPrompt.trim(),
      instructionPrompt: form.instructionPrompt.trim(),
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
  operatingKey.value = row.templateKey
  try {
    if (row.builtIn) {
      await copyBuiltinAdminAiPromptTemplate(row.featureType)
    } else {
      await copyAdminAiPromptTemplate(row.id)
    }
    ElMessage.success('已复制为新模板副本')
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

async function activateTemplate(group, row) {
  operatingKey.value = row.templateKey
  try {
    await bindAdminAiPromptFeature(group.featureType, { templateId: row.id ? Number(row.id) : null })
    ElMessage.success(row.id ? '已设为当前使用模板' : '已恢复默认提示词')
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

async function restoreDefault(group) {
  if (!group) return
  operatingKey.value = group.builtinTemplate?.templateKey || `${group.featureType}:default`
  try {
    await bindAdminAiPromptFeature(group.featureType, { templateId: null })
    ElMessage.success('已恢复默认提示词')
    await loadData()
  } finally {
    operatingKey.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="AI 提示词管理" subtitle="按功能维护默认提示词和自定义模板">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增模板</el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="8" animated />
    <EmptyState v-else-if="groups.length === 0" title="暂无 AI 提示词模板" description="后端会提供 3 个功能的默认提示词作为只读兜底。">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增模板</el-button>
    </EmptyState>
    <el-tabs v-else v-model="activeFeatureType" class="prompt-tabs">
      <el-tab-pane v-for="group in groups" :key="group.featureType" :name="group.featureType">
        <template #label>
          <span>{{ group.featureLabel }}</span>
          <el-tag class="tab-tag" size="small" :type="group.usingDefault ? 'info' : 'success'">
            {{ group.usingDefault ? '默认中' : '自定义中' }}
          </el-tag>
        </template>

        <el-card class="panel-card prompt-panel" shadow="never">
          <div class="prompt-section-header">
            <div>
              <strong>默认提示词</strong>
              <p>后端内置兜底，管理端只读，可复制为新模板副本。</p>
            </div>
            <div class="admin-table-actions">
              <el-button size="small" plain :icon="CopyDocument" @click="copyTemplate(group.builtinTemplate)">复制副本</el-button>
              <el-button
                v-if="!group.usingDefault"
                size="small"
                plain
                type="warning"
                :icon="Select"
                :loading="operatingKey === group.builtinTemplate.templateKey"
                @click="restoreDefault(group)"
              >
                恢复默认
              </el-button>
              <el-tag v-else type="success">当前使用</el-tag>
            </div>
          </div>

          <div class="prompt-readonly-grid">
            <div class="prompt-readonly-block">
              <span class="prompt-readonly-label">系统提示词</span>
              <el-input :model-value="group.builtinTemplate.systemPrompt" type="textarea" :rows="4" readonly />
            </div>
            <div class="prompt-readonly-block">
              <span class="prompt-readonly-label">规则提示词</span>
              <el-input :model-value="group.builtinTemplate.instructionPrompt" type="textarea" :rows="10" readonly />
            </div>
          </div>
        </el-card>

        <el-card class="panel-card mt-16" shadow="never">
          <div class="prompt-section-header">
            <div>
              <strong>自定义模板</strong>
              <p>可复制、编辑并切换当前生效模板。</p>
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
            <el-table-column label="操作" width="320">
              <template #default="{ row }">
                <div class="admin-table-actions">
                  <el-button size="small" text type="primary" :icon="View" @click="openDetail(row)">查看</el-button>
                  <el-button size="small" text type="primary" :icon="Edit" :disabled="!row.editable" @click="openEdit(row)">编辑</el-button>
                  <el-button size="small" text type="primary" :icon="CopyDocument" :loading="operatingKey === row.templateKey" @click="copyTemplate(row)">复制副本</el-button>
                  <el-button
                    v-if="row.active"
                    size="small"
                    plain
                    type="warning"
                    :icon="Select"
                    :loading="operatingKey === group.builtinTemplate.templateKey"
                    @click="restoreDefault(group)"
                  >
                    恢复默认
                  </el-button>
                  <el-button
                    v-else
                    size="small"
                    plain
                    type="success"
                    :icon="Select"
                    :disabled="!row.enabled"
                    :loading="operatingKey === row.templateKey"
                    @click="activateTemplate(group, row)"
                  >
                    设为当前
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
          <EmptyState v-else title="暂无自定义模板" description="可以先复制默认提示词，或直接新增一套模板。" />
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="drawerVisible" :title="editingTemplate ? '编辑提示词模板' : '新增提示词模板'" size="760px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="AI 功能" prop="featureType">
          <el-select v-model="form.featureType" class="full-input" :disabled="Boolean(editingTemplate)">
            <el-option label="AI 问答" value="WORD_QA" />
            <el-option label="AI 完形填空" value="CLOZE_QUIZ" />
            <el-option label="AI 评阅" value="CLOZE_REVIEW" />
          </el-select>
        </el-form-item>
        <el-form-item label="模板名称" prop="name">
          <el-input v-model.trim="form.name" maxlength="128" placeholder="例如：更自然的完形填空提示词" />
        </el-form-item>
        <el-form-item label="系统提示词" prop="systemPrompt">
          <el-input v-model="form.systemPrompt" type="textarea" :rows="5" maxlength="12000" show-word-limit />
        </el-form-item>
        <el-form-item label="规则提示词" prop="instructionPrompt">
          <el-input v-model="form.instructionPrompt" type="textarea" :rows="14" maxlength="20000" show-word-limit />
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
              v-if="detailTemplate.builtIn"
              size="small"
              plain
              type="warning"
              :icon="Select"
              :loading="operatingKey === detailTemplate.templateKey"
              @click="restoreDefault(activeGroup || groups[0])"
            >
              恢复默认
            </el-button>
          </div>
        </div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="当前使用">{{ detailTemplate.active ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="是否启用">{{ detailTemplate.enabled ? '是' : '否' }}</el-descriptions-item>
          <el-descriptions-item label="来源">{{ detailTemplate.sourceBuiltinKey || detailTemplate.sourceTemplateId || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="prompt-readonly-block mt-16">
          <span class="prompt-readonly-label">系统提示词</span>
          <el-input :model-value="detailTemplate.systemPrompt" type="textarea" :rows="5" readonly />
        </div>
        <div class="prompt-readonly-block mt-16">
          <span class="prompt-readonly-label">规则提示词</span>
          <el-input :model-value="detailTemplate.instructionPrompt" type="textarea" :rows="14" readonly />
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

.tab-tag {
  margin-left: 8px;
}

.mt-16 {
  margin-top: 16px;
}
</style>
