<script setup>
import { reactive, ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus, Refresh, Search } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createSystemConfig, deleteSystemConfig, fetchSystemConfigs, updateSystemConfig } from '../../api/admin'

const valueTypeOptions = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON']

const loading = ref(false)
const saving = ref(false)
const deletingId = ref('')
const drawerVisible = ref(false)
const editingConfig = ref(null)
const formRef = ref()
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({ keyword: '', valueType: '', editable: '', page: 1, size: 20 })
const form = reactive({ configKey: '', configValue: '', valueType: 'STRING', description: '', editable: true })

const rules = {
  configKey: [
    { required: true, message: '请输入配置键', trigger: 'blur' },
    { max: 128, message: '配置键不能超过 128 个字符', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, message: '配置键只能使用小写字母、数字、下划线和点号', trigger: 'blur' },
  ],
  valueType: [{ required: true, message: '请选择类型', trigger: 'change' }],
  description: [{ max: 512, message: '说明不能超过 512 个字符', trigger: 'blur' }],
}

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    keyword: filters.keyword?.trim() || undefined,
    valueType: filters.valueType || undefined,
    editable: filters.editable === '' ? undefined : filters.editable,
  }
}

function resetForm() {
  editingConfig.value = null
  Object.assign(form, { configKey: '', configValue: '', valueType: 'STRING', description: '', editable: true })
  formRef.value?.clearValidate()
}

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchSystemConfigs(queryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
  } finally {
    loading.value = false
  }
}

function searchConfigs() {
  filters.page = 1
  loadData()
}

function resetFilters() {
  Object.assign(filters, { keyword: '', valueType: '', editable: '', page: 1 })
  loadData()
}

function handlePageChange(currentPage) {
  filters.page = currentPage
  loadData()
}

function openCreate() {
  resetForm()
  drawerVisible.value = true
}

function openEdit(row) {
  editingConfig.value = row
  Object.assign(form, {
    configKey: row.configKey,
    configValue: row.configValue || '',
    valueType: row.valueType,
    description: row.description || '',
    editable: row.editable,
  })
  drawerVisible.value = true
}

async function submitForm() {
  await formRef.value.validate()
  saving.value = true
  try {
    const payload = { ...form }
    if (editingConfig.value?.id) {
      await updateSystemConfig(editingConfig.value.id, payload)
      ElMessage.success('配置已更新')
    } else {
      await createSystemConfig(payload)
      ElMessage.success('配置已创建')
    }
    drawerVisible.value = false
    await loadData()
  } finally {
    saving.value = false
  }
}

async function removeConfig(row) {
  await ElMessageBox.confirm(`确认删除配置 ${row.configKey}？`, '删除配置', { type: 'warning' })
  deletingId.value = row.id
  try {
    await deleteSystemConfig(row.id)
    ElMessage.success('配置已删除')
    await loadData()
  } finally {
    deletingId.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="系统配置" subtitle="管理后台可编辑的平台配置项">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增配置</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-input v-model="filters.keyword" class="filter-grow" clearable placeholder="搜索配置键或说明" @keyup.enter="searchConfigs" />
        <el-select v-model="filters.valueType" clearable placeholder="全部类型" @change="searchConfigs">
          <el-option v-for="item in valueTypeOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.editable" clearable placeholder="编辑状态" @change="searchConfigs">
          <el-option label="可编辑" :value="true" />
          <el-option label="不可编辑" :value="false" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="searchConfigs">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无系统配置" />
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="configKey" label="配置键" min-width="220" />
          <el-table-column prop="configValue" label="配置值" min-width="220" show-overflow-tooltip />
          <el-table-column prop="valueType" label="类型" width="110" />
          <el-table-column prop="editable" label="可编辑" width="100">
            <template #default="{ row }"><el-tag :type="row.editable ? 'success' : 'info'">{{ row.editable ? '是' : '否' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="220" />
          <el-table-column label="操作" width="170">
            <template #default="{ row }">
              <div class="admin-table-actions">
                <el-button size="small" text type="primary" :icon="Edit" :disabled="!row.editable" @click="openEdit(row)">编辑</el-button>
                <el-button size="small" plain type="danger" :icon="Delete" :loading="deletingId === row.id" :disabled="!row.editable" @click="removeConfig(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
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

    <el-drawer v-model="drawerVisible" :title="editingConfig ? '编辑配置' : '新增配置'" size="460px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="配置键" prop="configKey">
          <el-input v-model.trim="form.configKey" maxlength="128" placeholder="feature.daily_report.enabled" />
        </el-form-item>
        <el-form-item label="类型" prop="valueType">
          <el-select v-model="form.valueType" class="full-input">
            <el-option v-for="item in valueTypeOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="配置值" prop="configValue">
          <el-input v-if="form.valueType === 'JSON'" v-model="form.configValue" type="textarea" :rows="7" placeholder='{"enabled": true}' />
          <el-select v-else-if="form.valueType === 'BOOLEAN'" v-model="form.configValue" class="full-input" placeholder="选择布尔值">
            <el-option label="true" value="true" />
            <el-option label="false" value="false" />
          </el-select>
          <el-input v-else v-model.trim="form.configValue" :placeholder="form.valueType === 'NUMBER' ? '100' : '配置值'" />
        </el-form-item>
        <el-form-item label="说明" prop="description">
          <el-input v-model.trim="form.description" type="textarea" :rows="3" maxlength="512" show-word-limit />
        </el-form-item>
        <el-form-item label="后台可编辑" prop="editable">
          <el-switch v-model="form.editable" />
        </el-form-item>
        <div class="button-row">
          <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
          <el-button @click="drawerVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-drawer>
  </section>
</template>
