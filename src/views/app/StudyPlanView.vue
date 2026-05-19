<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import StarterPanel from '../../components/StarterPanel.vue'
import { createStudyPlan, endStudyPlan, fetchPrimaryPlan, pauseStudyPlan, resumeStudyPlan } from '../../api/study'
import { fetchWordbooks } from '../../api/wordbook'

const route = useRoute()
const router = useRouter()
const formRef = ref()
const loading = ref(false)
const loadingWordbooks = ref(false)
const saving = ref(false)
const plan = ref(null)
const wordbooks = ref([])

const form = reactive({
  wordbookId: route.query.wordbookId || '',
  name: '',
  dailyNewWords: 30,
  startDate: new Date().toISOString().slice(0, 10),
  isPrimary: true,
})

const selectedWordbook = computed(() => wordbooks.value.find((item) => item.id === form.wordbookId))

const rules = {
  wordbookId: [{ required: true, message: '请选择词库', trigger: 'change' }],
  name: [{ required: true, message: '请输入计划名称', trigger: 'blur' }],
  dailyNewWords: [{ required: true, message: '请输入每日新词数', trigger: 'blur' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
}

function defaultPlanName(book = selectedWordbook.value) {
  return book ? `${book.name} 学习计划` : ''
}

async function loadWordbooks() {
  loadingWordbooks.value = true
  try {
    wordbooks.value = await fetchWordbooks()
    const queryWordbookId = route.query.wordbookId ? String(route.query.wordbookId) : ''
    if (queryWordbookId && wordbooks.value.some((item) => item.id === queryWordbookId)) {
      form.wordbookId = queryWordbookId
    } else if (!form.wordbookId && wordbooks.value.length > 0) {
      form.wordbookId = wordbooks.value[0].id
    }
    if (!form.name) {
      form.name = defaultPlanName()
    }
  } finally {
    loadingWordbooks.value = false
  }
}

function handleWordbookChange() {
  form.name = defaultPlanName()
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
  const dailyNewWords = Number(form.dailyNewWords)
  if (dailyNewWords > 50) {
    try {
      await ElMessageBox.confirm(
        `本计划每日将生成 ${dailyNewWords} 个新词，是否继续？`,
        '确认每日新词数量',
        {
          confirmButtonText: '继续创建',
          cancelButtonText: '再调整',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }
  saving.value = true
  try {
    plan.value = await createStudyPlan({ ...form, wordbookId: String(form.wordbookId).trim() })
    ElMessage.success('学习计划已创建')
    router.push('/app')
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

function scrollToCreateForm() {
  document.querySelector('.create-plan-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  loadWordbooks()
  loadPlan()
})
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
        <StarterPanel
          v-else-if="!plan"
          title="先创建学习计划"
          description="选择词库并设置每日新词后，系统会自动生成今天的学习任务。"
          :icon="Calendar"
        >
          <el-button type="primary" @click="scrollToCreateForm">创建计划</el-button>
          <el-button @click="router.push('/app/wordbooks')">选择词库</el-button>
        </StarterPanel>
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

      <el-card class="panel-card create-plan-card" shadow="never">
        <template #header>创建新计划</template>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
          <el-form-item label="目标词库" prop="wordbookId">
            <el-select v-model="form.wordbookId" class="full-input" filterable placeholder="选择词库" :loading="loadingWordbooks" @change="handleWordbookChange">
              <el-option v-for="book in wordbooks" :key="book.id" :label="`${book.name}（${book.wordCount || 0} 词）`" :value="book.id" />
            </el-select>
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
