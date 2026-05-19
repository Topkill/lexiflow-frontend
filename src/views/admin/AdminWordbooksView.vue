<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Plus, Refresh, Search, Tickets } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createAdminWordbook, disableAdminWordbook, enableAdminWordbook, fetchAdminWordbooks, updateAdminWordbook } from '../../api/admin'

const typeOptions = ['CET4', 'CET6', 'POSTGRADUATE']

const router = useRouter()
const loading = ref(false)
const saving = ref(false)
const changingId = ref('')
const drawerVisible = ref(false)
const editingWordbook = ref(null)
const formRef = ref()
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({ keyword: '', type: '', enabled: '', page: 1, size: 20 })
const form = reactive({ name: '', code: '', type: 'CET4', description: '', coverUrl: '', difficultyLevel: 2, enabled: true, sortOrder: 100 })

const drawerTitle = computed(() => (editingWordbook.value ? '编辑词库' : '新增词库'))

const rules = {
  name: [
    { required: true, message: '请输入词库名称', trigger: 'blur' },
    { max: 128, message: '词库名称不能超过 128 个字符', trigger: 'blur' },
  ],
  code: [
    { required: true, message: '请输入词库编码', trigger: 'blur' },
    { max: 64, message: '词库编码不能超过 64 个字符', trigger: 'blur' },
  ],
  type: [{ required: true, message: '请选择词库类型', trigger: 'change' }],
  description: [{ max: 512, message: '词库描述不能超过 512 个字符', trigger: 'blur' }],
  coverUrl: [{ max: 512, message: '封面图地址不能超过 512 个字符', trigger: 'blur' }],
  difficultyLevel: [{ required: true, message: '请选择难度', trigger: 'change' }],
  sortOrder: [{ required: true, message: '请输入排序值', trigger: 'change' }],
}

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    keyword: filters.keyword?.trim() || undefined,
    type: filters.type || undefined,
    enabled: filters.enabled === '' ? undefined : filters.enabled,
  }
}

function resetForm() {
  editingWordbook.value = null
  Object.assign(form, { name: '', code: '', type: 'CET4', description: '', coverUrl: '', difficultyLevel: 2, enabled: true, sortOrder: 100 })
  formRef.value?.clearValidate()
}

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchAdminWordbooks(queryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
  } finally {
    loading.value = false
  }
}

function searchWordbooks() {
  filters.page = 1
  loadData()
}

function resetFilters() {
  Object.assign(filters, { keyword: '', type: '', enabled: '', page: 1 })
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
  editingWordbook.value = row
  Object.assign(form, {
    name: row.name || '',
    code: row.code || '',
    type: row.type || 'CET4',
    description: row.description || '',
    coverUrl: row.coverUrl || '',
    difficultyLevel: row.difficultyLevel || 2,
    enabled: row.enabled ?? true,
    sortOrder: row.sortOrder ?? 100,
  })
  drawerVisible.value = true
}

function buildPayload() {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    type: form.type,
    description: form.description?.trim() || null,
    coverUrl: form.coverUrl?.trim() || null,
    difficultyLevel: form.difficultyLevel,
    enabled: form.enabled,
    sortOrder: form.sortOrder,
  }
}

async function submitForm() {
  await formRef.value.validate()
  saving.value = true
  try {
    if (editingWordbook.value?.id) {
      await updateAdminWordbook(editingWordbook.value.id, buildPayload())
      ElMessage.success('词库已更新')
    } else {
      await createAdminWordbook(buildPayload())
      ElMessage.success('词库已创建')
    }
    drawerVisible.value = false
    await loadData()
  } finally {
    saving.value = false
  }
}

async function toggleEnabled(row) {
  changingId.value = row.id
  try {
    if (row.enabled) {
      await disableAdminWordbook(row.id)
      ElMessage.success('词库已停用')
    } else {
      await enableAdminWordbook(row.id)
      ElMessage.success('词库已启用')
    }
    await loadData()
  } finally {
    changingId.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="词库管理" subtitle="维护考试词库、状态和排序">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增词库</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-input v-model="filters.keyword" class="filter-grow" clearable placeholder="搜索词库名称或编码" @keyup.enter="searchWordbooks" />
        <el-select v-model="filters.type" clearable placeholder="全部类型" @change="searchWordbooks">
          <el-option v-for="item in typeOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="filters.enabled" clearable placeholder="启用状态" @change="searchWordbooks">
          <el-option label="启用" :value="true" />
          <el-option label="停用" :value="false" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="searchWordbooks">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无词库" />
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="name" label="词库" min-width="180" />
          <el-table-column prop="code" label="编码" min-width="160" />
          <el-table-column prop="type" label="类型" width="140" />
          <el-table-column prop="difficultyLevel" label="难度" width="80" />
          <el-table-column prop="wordCount" label="单词数" width="100" />
          <el-table-column prop="enabled" label="启用" width="100">
            <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '是' : '否' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column label="操作" width="250">
            <template #default="{ row }">
              <el-button text :icon="Tickets" @click="router.push(`/admin/words?wordbookId=${row.id}`)">单词</el-button>
              <el-button text type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
              <el-button text :type="row.enabled ? 'warning' : 'success'" :loading="changingId === row.id" @click="toggleEnabled(row)">
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
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

    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="480px" @closed="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="词库名称" prop="name">
          <el-input v-model.trim="form.name" maxlength="128" />
        </el-form-item>
        <el-form-item label="词库编码" prop="code">
          <el-input v-model.trim="form.code" maxlength="64" placeholder="CET4_CORE" />
        </el-form-item>
        <div class="form-two-col">
          <el-form-item label="词库类型" prop="type">
            <el-select v-model="form.type" class="full-input">
              <el-option v-for="item in typeOptions" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
          <el-form-item label="难度" prop="difficultyLevel">
            <el-input-number v-model="form.difficultyLevel" :min="1" :max="5" />
          </el-form-item>
        </div>
        <el-form-item label="词库描述" prop="description">
          <el-input v-model.trim="form.description" type="textarea" :rows="3" maxlength="512" show-word-limit />
        </el-form-item>
        <el-form-item label="封面图 URL" prop="coverUrl">
          <el-input v-model.trim="form.coverUrl" maxlength="512" />
        </el-form-item>
        <div class="form-two-col">
          <el-form-item label="排序" prop="sortOrder">
            <el-input-number v-model="form.sortOrder" :min="0" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </div>
        <div class="button-row">
          <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
          <el-button @click="drawerVisible = false">取消</el-button>
        </div>
      </el-form>
    </el-drawer>
  </section>
</template>
