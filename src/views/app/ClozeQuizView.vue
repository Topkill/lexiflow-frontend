<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Check, CircleClose, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { createClozeTask, fetchClozeQuiz, submitClozeAttempt } from '../../api/ai'
import { fetchTodayTask } from '../../api/study'

const router = useRouter()
const route = useRoute()
const loadingTask = ref(false)
const generating = ref(false)
const submitting = ref(false)
const todayTask = ref(null)
const quiz = ref(null)
const attempt = ref(null)
const needsPlan = ref(false)
const loadError = ref('')
const generateError = ref('')
const startedAt = ref(null)
const form = reactive({
  sourceType: 'COMPLETED_GROUP',
  targetWordCount: 10,
})
const answers = reactive({})

const sourceOptions = [
  { label: '本组单词', value: 'COMPLETED_GROUP' },
  { label: '综合', value: 'MIXED' },
  { label: '今日新词', value: 'TODAY_NEW' },
  { label: '错词', value: 'WRONG_WORDS' },
]

const targetOptions = [5, 6, 7, 8, 9, 10].map((count) => ({ label: `${count} 个词`, value: count }))
const candidateWords = computed(() => Array.isArray(quiz.value?.candidateWords) ? quiz.value.candidateWords : [])
const quizReady = computed(() => Boolean(quiz.value?.blanks?.length))
const allAnswered = computed(() => quizReady.value && quiz.value.blanks.every((blank) => answers[blank.blankId]))
const totalCount = computed(() => todayTask.value?.items?.length || 0)
const pendingCount = computed(() => todayTask.value?.items?.filter((item) => item.status === 'PENDING').length || 0)
const taskDone = computed(() => todayTask.value?.status === 'DONE')
const completedGroupReady = computed(() => taskDone.value && totalCount.value >= 10)
const generateDisabled = computed(() => generating.value || (form.sourceType === 'COMPLETED_GROUP' && !completedGroupReady.value))
const generateHint = computed(() => {
  if (form.sourceType !== 'COMPLETED_GROUP' || completedGroupReady.value) return ''
  if (!taskDone.value) return '完成今日学习组后才能生成本组 10 空完形填空。'
  return '本组已完成单词不足 10 个，暂不能生成 10 空完形填空。'
})
const wrongAnswerMap = computed(() => {
  const map = new Map()
  ;(attempt.value?.answers || []).forEach((answer) => map.set(String(answer.blankId), answer))
  return map
})

function blankAnswer(blankId) {
  return wrongAnswerMap.value.get(String(blankId))
}

async function loadTodayTask() {
  loadingTask.value = true
  loadError.value = ''
  try {
    todayTask.value = await fetchTodayTask()
    if (todayTask.value?.status !== 'DONE' && form.sourceType === 'COMPLETED_GROUP') {
      form.sourceType = 'MIXED'
    }
    needsPlan.value = false
  } catch (error) {
    todayTask.value = null
    needsPlan.value = error.code === 30001
    loadError.value = needsPlan.value ? '' : error.message
  } finally {
    loadingTask.value = false
  }
}

function resetQuizState() {
  quiz.value = null
  attempt.value = null
  Object.keys(answers).forEach((key) => delete answers[key])
}

function applyRouteGenerateError() {
  if (route.query.generateError === 'config') {
    generateError.value = 'AI 配置不可用，请先检查公共配置或私有配置。'
  } else if (route.query.generateError === 'ai') {
    generateError.value = 'AI 完形填空暂时生成失败，请稍后重试，或检查 AI 服务是否可访问。'
  }
}

async function generateQuiz() {
  if (!todayTask.value?.taskId) {
    ElMessage.warning('请先生成今日任务')
    return
  }
  if (generateHint.value) {
    ElMessage.warning(generateHint.value)
    return
  }
  generating.value = true
  generateError.value = ''
  try {
    resetQuizState()
    const task = await createClozeTask({
      dailyTaskId: Number(todayTask.value.taskId),
      sourceType: form.sourceType,
      targetWordCount: form.sourceType === 'COMPLETED_GROUP' ? 10 : form.targetWordCount,
    }, { silentError: true })
    const quizId = task.resultId
    if (!quizId) {
      throw new Error('完形填空生成成功，但没有返回题目 ID')
    }
    quiz.value = await fetchClozeQuiz(quizId)
    startedAt.value = Date.now()
    ElMessage.success('练习已生成')
  } catch (error) {
    generateError.value = error.code === 40001
      ? 'AI 配置不可用，请先检查公共配置或私有配置。'
      : 'AI 完形填空暂时生成失败，请稍后重试，或检查 AI 服务是否可访问。'
  } finally {
    generating.value = false
  }
}

async function loadQuizById(quizId) {
  resetQuizState()
  quiz.value = await fetchClozeQuiz(quizId)
  startedAt.value = Date.now()
}

async function submitAnswers() {
  if (!quiz.value?.quizId || !allAnswered.value) return
  submitting.value = true
  try {
    const durationSeconds = startedAt.value ? Math.max(0, Math.round((Date.now() - startedAt.value) / 1000)) : 0
    attempt.value = await submitClozeAttempt(quiz.value.quizId, {
      durationSeconds,
      answers: quiz.value.blanks.map((blank) => ({ blankId: Number(blank.blankId), answer: answers[blank.blankId] })),
    })
    ElMessage.success('答案已提交')
  } finally {
    submitting.value = false
  }
}

function selectAnswer(blank, word) {
  if (attempt.value) return
  answers[blank.blankId] = word
}

function clearAnswer(blank) {
  if (attempt.value) return
  delete answers[blank.blankId]
}

function answerTagType(answer) {
  if (!answer) return 'info'
  return answer.correct ? 'success' : 'danger'
}

onMounted(async () => {
  await loadTodayTask()
  applyRouteGenerateError()
  if (route.query.quizId) {
    await loadQuizById(route.query.quizId)
  }
})
</script>

<template>
  <section>
    <PageHeader title="AI 完形填空" subtitle="基于今日新词和错词生成选词填空">
      <el-button :icon="Refresh" @click="loadTodayTask">刷新任务</el-button>
    </PageHeader>

    <el-skeleton v-if="loadingTask" :rows="6" animated />

    <template v-else>
      <el-card v-if="!todayTask" class="panel-card narrow" shadow="never">
        <EmptyState
          :title="needsPlan ? '先创建学习计划' : '暂时无法加载今日任务'"
          :description="needsPlan ? '创建计划并完成一组单词后，就可以生成 AI 完形填空。' : (loadError || '请稍后重试，或检查后端服务。')"
        >
          <el-button v-if="needsPlan" type="primary" @click="router.push('/app/plans')">创建计划</el-button>
          <el-button v-if="needsPlan" @click="router.push('/app/wordbooks')">选择词库</el-button>
          <el-button v-else type="primary" @click="loadTodayTask">重试</el-button>
        </EmptyState>
      </el-card>

      <div v-else class="cloze-layout">
        <div class="cloze-main">
          <el-card class="panel-card" shadow="never">
            <template #header>
              <div class="card-header-row">
                <span>生成练习</span>
                <el-tag>{{ todayTask.plan?.wordbookName || '今日任务' }}</el-tag>
              </div>
            </template>
            <el-form class="cloze-form" label-position="top">
              <el-form-item label="生成来源">
                <el-segmented v-model="form.sourceType" :options="sourceOptions" />
              </el-form-item>
              <el-form-item label="目标词数">
                <el-segmented v-model="form.targetWordCount" :options="targetOptions" :disabled="form.sourceType === 'COMPLETED_GROUP'" />
              </el-form-item>
              <el-button type="primary" :loading="generating" :disabled="generateDisabled" @click="generateQuiz">
                {{ quiz ? '重新生成练习' : '生成练习' }}
              </el-button>
            </el-form>
            <el-alert v-if="generateHint" class="mt-16" type="info" :title="generateHint" :closable="false" />
            <el-alert v-if="generateError" class="mt-16" type="warning" :title="generateError" :closable="false" />
          </el-card>

          <el-card v-if="quiz" class="panel-card mt-16" shadow="never">
            <template #header>
              <div class="card-header-row">
                <span>{{ quiz.title || '完形填空练习' }}</span>
                <el-tag v-if="attempt" :type="attempt.wrongCount ? 'warning' : 'success'">
                  得分 {{ attempt.score }}
                </el-tag>
              </div>
            </template>

            <div class="cloze-passage">{{ quiz.passage }}</div>

            <div class="cloze-candidates">
              <el-tag v-for="word in candidateWords" :key="word" effect="plain">{{ word }}</el-tag>
            </div>

            <div class="cloze-blank-list">
              <div v-for="blank in quiz.blanks" :key="blank.blankId" class="cloze-blank-item">
                <div class="blank-title-row">
                  <strong>空格 {{ blank.blankNo }}</strong>
                  <el-tag :type="answerTagType(blankAnswer(blank.blankId))">
                    {{ blankAnswer(blank.blankId)?.correct === true ? '正确' : blankAnswer(blank.blankId)?.correct === false ? '错误' : '待作答' }}
                  </el-tag>
                </div>
                <p v-if="blank.hint" class="muted">提示：{{ blank.hint }}</p>
                <div class="candidate-buttons">
                  <el-button
                    v-for="word in candidateWords"
                    :key="`${blank.blankId}-${word}`"
                    :type="answers[blank.blankId] === word ? 'primary' : 'default'"
                    :disabled="Boolean(attempt)"
                    @click="selectAnswer(blank, word)"
                  >
                    {{ word }}
                  </el-button>
                  <el-button v-if="answers[blank.blankId] && !attempt" text @click="clearAnswer(blank)">清空</el-button>
                </div>
                <div v-if="attempt" class="answer-result">
                  <el-icon :class="blankAnswer(blank.blankId)?.correct ? 'result-correct' : 'result-wrong'">
                    <Check v-if="blankAnswer(blank.blankId)?.correct" />
                    <CircleClose v-else />
                  </el-icon>
                  <span>你的答案：{{ blankAnswer(blank.blankId)?.userAnswer || '未作答' }}</span>
                  <span>正确答案：{{ blankAnswer(blank.blankId)?.correctAnswer }}</span>
                </div>
                <p v-if="attempt && blankAnswer(blank.blankId)?.explanation" class="cloze-explanation">
                  {{ blankAnswer(blank.blankId).explanation }}
                </p>
              </div>
            </div>

            <div class="cloze-submit-row">
              <el-button :disabled="Boolean(attempt) || !allAnswered" type="primary" :loading="submitting" @click="submitAnswers">
                提交答案
              </el-button>
              <el-button v-if="attempt" @click="generateQuiz">再练一组</el-button>
            </div>
          </el-card>

          <el-card v-else class="panel-card mt-16" shadow="never">
            <EmptyState title="还没有练习" :description="generateError || '完成一组单词后，系统会优先用不认识和模糊的词生成 10 空完形填空。'">
              <el-button type="primary" :loading="generating" :disabled="generateDisabled" @click="generateQuiz">生成练习</el-button>
              <el-button @click="router.push('/app/study')">
                去背单词
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </EmptyState>
          </el-card>
        </div>

        <el-card class="panel-card cloze-side" shadow="never">
          <template #header>今日任务</template>
          <div class="task-summary compact">
            <el-progress :percentage="todayTask.progress?.completionRate ?? todayTask.completionRate ?? 0" />
            <div class="task-lines vertical">
              <span>新词 {{ todayTask.newCount || 0 }}</span>
              <span>复习 {{ todayTask.reviewCount || 0 }}</span>
              <span>专项 {{ todayTask.extraCount || 0 }}</span>
              <span>待完成 {{ pendingCount }}</span>
              <span>总计 {{ totalCount }}</span>
            </div>
          </div>
        </el-card>
      </div>
    </template>
  </section>
</template>
