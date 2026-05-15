<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search, View } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { disableAdminUser, enableAdminUser, fetchAdminUserDetail, fetchAdminUsers } from '../../api/admin'

const loading = ref(false)
const detailLoading = ref(false)
const changingId = ref('')
const detailVisible = ref(false)
const currentUser = ref(null)
const page = ref({ records: [], total: 0, page: 1, size: 20 })
const filters = reactive({ keyword: '', status: '', page: 1, size: 20 })

function queryParams() {
  return {
    page: filters.page,
    size: filters.size,
    keyword: filters.keyword?.trim() || undefined,
    status: filters.status || undefined,
  }
}

function statusTagType(status) {
  return status === 'ACTIVE' ? 'success' : 'danger'
}

async function loadData() {
  loading.value = true
  try {
    page.value = await fetchAdminUsers(queryParams())
    filters.page = Number(page.value.page || filters.page)
    filters.size = Number(page.value.size || filters.size)
  } finally {
    loading.value = false
  }
}

function searchUsers() {
  filters.page = 1
  loadData()
}

function resetFilters() {
  Object.assign(filters, { keyword: '', status: '', page: 1 })
  loadData()
}

function handlePageChange(currentPage) {
  filters.page = currentPage
  loadData()
}

async function openDetail(row) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    currentUser.value = await fetchAdminUserDetail(row.id)
  } finally {
    detailLoading.value = false
  }
}

async function changeUserStatus(row) {
  changingId.value = row.id
  try {
    if (row.status === 'ACTIVE') {
      await disableAdminUser(row.id)
      ElMessage.success('用户已禁用')
    } else {
      await enableAdminUser(row.id)
      ElMessage.success('用户已启用')
    }
    await loadData()
    if (currentUser.value?.id === row.id) {
      currentUser.value = await fetchAdminUserDetail(row.id)
    }
  } finally {
    changingId.value = ''
  }
}

onMounted(loadData)
</script>

<template>
  <section>
    <PageHeader title="用户管理" subtitle="查看用户状态、角色和学习概况">
      <el-button :icon="Refresh" @click="loadData">刷新</el-button>
    </PageHeader>
    <el-card class="panel-card" shadow="never">
      <div class="admin-filter-row">
        <el-input v-model="filters.keyword" class="filter-grow" clearable placeholder="搜索邮箱或昵称" @keyup.enter="searchUsers" />
        <el-select v-model="filters.status" clearable placeholder="全部状态" @change="searchUsers">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="禁用" value="DISABLED" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="searchUsers">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-skeleton v-if="loading" :rows="5" animated />
      <EmptyState v-else-if="page.records.length === 0" title="暂无用户" />
      <template v-else>
        <el-table :data="page.records">
          <el-table-column prop="email" label="邮箱" min-width="220" />
          <el-table-column prop="nickname" label="昵称" min-width="140" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="{ row }">
              <el-tag :type="row.role === 'ADMIN' ? 'warning' : 'info'">{{ row.role }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="lastLoginAt" label="最近登录" width="180" />
          <el-table-column prop="createdAt" label="注册时间" width="180" />
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" :icon="View" @click="openDetail(row)">详情</el-button>
              <el-button
                text
                :type="row.status === 'ACTIVE' ? 'danger' : 'success'"
                :loading="changingId === row.id"
                :disabled="row.role === 'ADMIN'"
                @click="changeUserStatus(row)"
              >
                {{ row.status === 'ACTIVE' ? '禁用' : '启用' }}
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

    <el-drawer v-model="detailVisible" title="用户详情" size="420px">
      <el-skeleton v-if="detailLoading" :rows="6" animated />
      <EmptyState v-else-if="!currentUser" title="请选择用户" />
      <template v-else>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="用户 ID">{{ currentUser.id }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ currentUser.email }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ currentUser.nickname }}</el-descriptions-item>
          <el-descriptions-item label="角色">{{ currentUser.role }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(currentUser.status)">{{ currentUser.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="最近登录">{{ currentUser.lastLoginAt || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近 IP">{{ currentUser.lastLoginIp || '-' }}</el-descriptions-item>
          <el-descriptions-item label="学习事件">{{ currentUser.studyEventCount }}</el-descriptions-item>
          <el-descriptions-item label="AI 调用">{{ currentUser.aiCallCount }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ currentUser.createdAt }}</el-descriptions-item>
        </el-descriptions>
        <div class="button-row mt-16">
          <el-button
            v-if="currentUser.role !== 'ADMIN'"
            :type="currentUser.status === 'ACTIVE' ? 'danger' : 'success'"
            :loading="changingId === currentUser.id"
            @click="changeUserStatus(currentUser)"
          >
            {{ currentUser.status === 'ACTIVE' ? '禁用用户' : '启用用户' }}
          </el-button>
        </div>
      </template>
    </el-drawer>
  </section>
</template>
