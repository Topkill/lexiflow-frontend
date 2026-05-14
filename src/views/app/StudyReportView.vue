<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createReportTask, fetchReports } from '../../api/ai'

const loading = ref(false)
const creating = ref(false)
const page = ref({ records: [], total: 0 })
const form = reactive({ reportDate: new Date().toISOString().slice(0, 10), regenerate: false })

async function loadReports() {
  loading.value = true
  try {
    page.value = await fetchReports({ page: 1, size: 10 })
  } finally {
    loading.value = false
  }
}

async function createReport() {
  creating.value = true
  try {
    await createReportTask(form)
    ElMessage.success('学习报告任务已创建')
    loadReports()
  } finally {
    creating.value = false
  }
}

onMounted(loadReports)
</script>

<template>
  <section>
    <PageHeader title="学习报告" subtitle="每日完成学习后生成 AI 反馈">
      <el-button :icon="Refresh" @click="loadReports">刷新</el-button>
    </PageHeader>
    <div class="work-grid">
      <el-card class="panel-card" shadow="never">
        <template #header>生成日报</template>
        <el-form label-position="top">
          <el-form-item label="报告日期">
            <el-date-picker v-model="form.reportDate" value-format="YYYY-MM-DD" type="date" class="full-input" />
          </el-form-item>
          <el-form-item label="重新生成">
            <el-switch v-model="form.regenerate" />
          </el-form-item>
          <el-button type="primary" :loading="creating" @click="createReport">生成报告</el-button>
        </el-form>
      </el-card>
      <el-card class="panel-card" shadow="never">
        <template #header>历史报告</template>
        <el-skeleton v-if="loading" :rows="5" animated />
        <EmptyState v-else-if="page.records.length === 0" title="暂无学习报告" />
        <div v-else class="report-list">
          <div v-for="report in page.records" :key="report.id" class="list-row">
            <strong>{{ report.reportDate }}</strong>
            <span>新词 {{ report.newWordsCount }}，复习 {{ report.reviewWordsCount }}</span>
          </div>
        </div>
      </el-card>
    </div>
  </section>
</template>
