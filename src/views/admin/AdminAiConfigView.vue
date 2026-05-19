<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, CirclePlus, Edit, Open, Refresh, TurnOff } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import {
  activateAdminAiPublicConfig,
  createAdminAiPublicConfig,
  disableAdminAiPublicConfig,
  enableAdminAiPublicConfig,
  fetchAdminAiPublicConfigs,
  updateAdminAiPublicConfig,
} from '../../api/admin'

const loading = ref(false)
const saving = ref(false)
const operatingId = ref('')
const configs = ref([])
const dialogVisible = ref(false)
const editingConfig = ref(null)
const formRef = ref(null)

const form = reactive({
  name: '',
  apiBaseUrl: '',
  apiKey: '',
  modelName: '',
  temperature: 0.7,
  dailyQuotaPerUser: 20,
  enabled: true,
  remark: '',
})

const rules = computed(() => ({
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  apiBaseUrl: [{ required: true, message: '请输入 API Base URL', trigger: 'blur' }],
  apiKey: editingConfig.value ? [] : [{ required: true, message: '请输入 API Key', trigger: 'blur' }],
  modelName: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  temperature: [{ required: true, message: '请输入温度', trigger: 'blur' }],
  dailyQuotaPerUser: [{ required: true, message: '请输入每日配额', trigger: 'blur' }],
}))

const dialogTitle = computed(() => (editingConfig.value ? '编辑公共 AI 配置' : '新增公共 AI 配置'))

async function loadData() {
  loading.value = true
  try {
    configs.value = await fetchAdminAiPublicConfigs()
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    name: '',
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: 'gpt-4.1-mini',
    temperature: 0.7,
    dailyQuotaPerUser: 20,
    enabled: true,
    remark: '',
  })
}

function openCreateDialog() {
  editingConfig.value = null
  resetForm()
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEditDialog(row) {
  editingConfig.value = row
  Object.assign(form, {
    name: row.name || '',
    apiBaseUrl: row.apiBaseUrl || '',
    apiKey: '',
    modelName: row.modelName || '',
    temperature: Number(row.temperature ?? 0.7),
    dailyQuotaPerUser: row.dailyQuotaPerUser ?? 20,
    enabled: row.enabled ?? true,
    remark: row.remark || '',
  })
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function buildPayload() {
  const payload = {
    name: form.name.trim(),
    apiBaseUrl: form.apiBaseUrl.trim(),
    modelName: form.modelName.trim(),
    temperature: form.temperature,
    dailyQuotaPerUser: form.dailyQuotaPerUser,
    enabled: form.enabled,
    remark: form.remark?.trim() || null,
  }
  if (form.apiKey?.trim()) {
    payload.apiKey = form.apiKey.trim()
  }
  return payload
}

async function submitForm() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (editingConfig.value) {
      await updateAdminAiPublicConfig(editingConfig.value.id, buildPayload())
      ElMessage.success('公共 AI 配置已更新')
    } else {
      await createAdminAiPublicConfig(buildPayload())
      ElMessage.success('公共 AI 配置已创建')
    }
    dialogVisible.value = false
    await loadData()
  } finally {
    saving.value = false
  }
}

async function activateConfig(row) {
  operatingId.value = row.id
  try {
    await activateAdminAiPublicConfig(row.id)
    ElMessage.success('公共 AI 配置已激活')
    await loadData()
  } finally {
    operatingId.value = ''
  }
}

async function enableConfig(row) {
  operatingId.value = row.id
  try {
    await enableAdminAiPublicConfig(row.id)
    ElMessage.success('公共 AI 配置已启用')
    await loadData()
  } finally {
    operatingId.value = ''
  }
}

async function disableConfig(row) {
  await ElMessageBox.confirm(`确定停用「${row.name}」吗？停用后用户不能再使用该公共配置。`, '停用公共 AI 配置', {
    confirmButtonText: '停用',
    cancelButtonText: '取消',
    type: 'warning',
  })
  operatingId.value = row.id
  try {
    await disableAdminAiPublicConfig(row.id)
    ElMessage.success('公共 AI 配置已停用')
    await loadData()
  } finally {
    operatingId.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="公共 AI 配置" subtitle="维护 OpenAI 兼容接口、模型和公共配额">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="CirclePlus" @click="openCreateDialog">新增配置</el-button>
    </PageHeader>

    <el-card class="panel-card" shadow="never">
      <el-skeleton v-if="loading" :rows="6" animated />
      <EmptyState v-else-if="configs.length === 0" title="暂无公共 AI 配置">
        <el-button type="primary" :icon="CirclePlus" @click="openCreateDialog">新增配置</el-button>
      </EmptyState>
      <el-table v-else :data="configs">
        <el-table-column prop="name" label="配置名称" min-width="170" />
        <el-table-column prop="modelName" label="模型" min-width="150" />
        <el-table-column prop="apiBaseUrl" label="API Base URL" min-width="260" show-overflow-tooltip />
        <el-table-column prop="dailyQuotaPerUser" label="每日配额" width="100" />
        <el-table-column prop="temperature" label="温度" width="90" />
        <el-table-column prop="keyConfigured" label="Key" width="90">
          <template #default="{ row }">
            <el-tag :type="row.keyConfigured ? 'success' : 'danger'">{{ row.keyConfigured ? '已配置' : '缺失' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="enabled" label="启用" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="active" label="激活" width="90">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'info'">{{ row.active ? '当前' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180" />
        <el-table-column label="操作" width="280">
          <template #default="{ row }">
            <el-button text :icon="Edit" @click="openEditDialog(row)">编辑</el-button>
            <el-button
              v-if="!row.enabled"
              text
              type="primary"
              :icon="Open"
              :loading="operatingId === row.id"
              @click="enableConfig(row)"
            >启用</el-button>
            <el-button
              text
              type="success"
              :icon="Check"
              :disabled="row.active || !row.enabled || !row.keyConfigured"
              :loading="operatingId === row.id"
              @click="activateConfig(row)"
            >激活</el-button>
            <el-button
              v-if="row.enabled"
              text
              type="danger"
              :icon="TurnOff"
              :loading="operatingId === row.id"
              @click="disableConfig(row)"
            >停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="配置名称" prop="name">
          <el-input v-model.trim="form.name" placeholder="例如 OpenAI 公共 Key" />
        </el-form-item>
        <el-form-item label="API Base URL" prop="apiBaseUrl">
          <el-input v-model.trim="form.apiBaseUrl" placeholder="https://api.openai.com/v1" />
        </el-form-item>
        <el-form-item label="API Key" prop="apiKey">
          <el-input v-model="form.apiKey" type="password" show-password :placeholder="editingConfig ? '留空则不覆盖已有密钥' : '保存时加密写入后端'" />
        </el-form-item>
        <el-form-item label="模型名称" prop="modelName">
          <el-input v-model.trim="form.modelName" placeholder="gpt-4.1-mini" />
        </el-form-item>
        <div class="form-two-col">
          <el-form-item label="温度" prop="temperature">
            <el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" />
          </el-form-item>
          <el-form-item label="每用户每日配额" prop="dailyQuotaPerUser">
            <el-input-number v-model="form.dailyQuotaPerUser" :min="0" :max="10000" />
          </el-form-item>
        </div>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="512" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>
