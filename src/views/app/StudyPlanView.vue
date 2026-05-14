<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createStudyPlan, endStudyPlan, fetchPrimaryPlan, pauseStudyPlan, resumeStudyPlan } from '../../api/study'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const loading = ref(false)
const saving = ref(false)
const plan = ref(null)

const form = reactive({
  wordbookId: route.query.wordbookId || '',
  name: '',
  dailyNewWords: 30,
  startDate: new Date().toISOString().slice(0, 10),
  isPrimary: true,
})

const rules = {
  wordbookId: [{ required: true, message: '请输入词库 ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  dailyNewWords: [{ required: true, message: '请输入每日新词数', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
}

async function loadPlan() {
  loading.value = true
  try {
    plan.value = await fetchPrimaryPlan()
  } catch {
    plan.value = null
  } finally {
    loading.value = false
  }
}

async function submit() {
  await formRef.value.validate()
  saving.value = true
  try {
    plan.value = await createStudyPlan({ ...form, wordbookId: Number(form.wordbookId) })
    ElMessage.success('学习计划已创建')
  } finally {
    saving.value = false
  }
}

async function changeStatus(action) {
  if (!plan.value?.id) return
  const handlers = { pause: pauseStudyPlan, resume: resumeStudyPlan, end: endStudyPlan }
  plan.value = await handlers[action](plan.value.id)
  ElMessage.success('计划状态已更新')
}

onMounted(loadPlan)
</script>

<template>
  <section>
    <PageHeader title="学习计划" subtitle="一个主计划驱动每日新词和复习任务">
      <el-button :icon="Refresh" @click="loadPlan">刷新</el-button>
      <el-button type="primary" :icon="Calendar" @click="router.push('/app/wordbooks')">选择词库</el-button>
    </PageHeader>

    <div class="work-grid">
      <el-card class="panel-card" shadow="never">
        <template #header>当前主计划</template>
        <el-skeleton v-if="loading" :rows="4" animated />
        <EmptyState v-else-if="!plan" title="还没有学习计划" description="这是新用户的第一步：先选择词库，再设置每日新词数量。">
          <el-button type="primary" @click="router.push('/app/wordbooks')">去选择词库</el-button>
        </EmptyState>
        <div v-else class="plan-card-body">
          <div class="plan-title-row">
            <h2>{{ plan.wordbookName }}</h2>
            <el-tag>{{ plan.status }}</el-tag>
          </div>
          <el-progress :percentage="plan.totalWords ? Math.round((plan.learnedCount / plan.totalWords) * 100) : 0" />
          <div class="plan-meta-grid">
            <span>每日 {{ plan.dailyNewWords }} 词</span>
            <span>已学 {{ plan.learnedCount }}/{{ plan.totalWords }}</span>
            <span>掌握 {{ plan.masteredCount }}</span>
            <span>预计 {{ plan.expectedFinishDate }}</span>
          </div>
          <div class="button-row">
            <el-button v-if="plan.status === 'ACTIVE'" @click="changeStatus('pause')">暂停</el-button>
            <el-button v-if="plan.status === 'PAUSED'" type="primary" @click="changeStatus('resume')">恢复</el-button>
            <el-button type="danger" plain @click="changeStatus('end')">结束</el-button>
          </div>
        </div>
      </el-card>

      <el-card class="panel-card" shadow="never">
        <template #header>创建新计划</template>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
          <el-form-item label="词库 ID" prop="wordbookId">
            <el-input v-model="form.wordbookId" placeholder="从词库页选择后自动带入" />
          </el-form-item>
          <el-form-item label="计划名称" prop="name">
            <el-input v-model.trim="form.name" placeholder="例如 CET4 核心词计划" />
          </el-form-item>
          <el-form-item label="每日新词" prop="dailyNewWords">
            <el-input-number v-model="form.dailyNewWords" :min="1" :max="300" />
          </el-form-item>
          <el-form-item label="开始日期" prop="startDate">
            <el-date-picker v-model="form.startDate" value-format="YYYY-MM-DD" type="date" class="full-input" />
          </el-form-item>
          <el-button type="primary" :loading="saving" class="full-button" @click="submit">创建计划</el-button>
        </el-form>
      </el-card>
    </div>
  </section>
</template>
