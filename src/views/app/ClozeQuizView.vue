<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Calendar, Check, CircleClose, Refresh } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import StarterPanel from '../../components/StarterPanel.vue'
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
const candidateOptions = computed(() => candidateWords.value.map((word, index) => ({
  label: String.fromCharCode(65 + index),
  word,
})))
const quizReady = computed(() => Boolean(quiz.value?.blanks?.length))
const allAnswered = computed(() => quizReady.value && quiz.value.blanks.every((blank) => answers[blank.blankId]))
const selectedBlankId = ref(null)
const activeBlank = computed(() => {
  const blanks = quiz.value?.blanks || []
  return blanks.find((blank) => String(blank.blankId) === String(selectedBlankId.value)) || null
})
const answeredCount = computed(() => {
  const blanks = quiz.value?.blanks || []
  return blanks.filter((blank) => answers[blank.blankId]).length
})
const clozePassageParts = computed(() => {
  if (!quiz.value?.passage) return []
  const blanksByNo = new Map((quiz.value.blanks || []).map((blank) => [String(blank.blankNo), blank]))
  const parts = []
  const pattern = /_{2,}\s*(\d+)\s*_{2,}/g
  let cursor = 0
  let match
  while ((match = pattern.exec(quiz.value.passage)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: 'text', text: quiz.value.passage.slice(cursor, match.index) })
    }
    const blank = blanksByNo.get(match[1])
    parts.push(blank
      ? { type: 'blank', blank }
      : { type: 'text', text: match[0] })
    cursor = pattern.lastIndex
  }
  if (cursor < quiz.value.passage.length) {
    parts.push({ type: 'text', text: quiz.value.passage.slice(cursor) })
  }
  return parts
})
const totalCount = computed(() => todayTask.value?.items?.length || 0)
const pendingCount = computed(() => todayTask.value?.items?.filter((item) => item.status === 'PENDING').length || 0)
const taskDone = computed(() => todayTask.value?.status === 'DONE')
const completedGroupReady = computed(() => taskDone.value && totalCount.value > 0)
const generateDisabled = computed(() => generating.value || (form.sourceType === 'COMPLETED_GROUP' && !completedGroupReady.value))
const canContinueStudy = computed(() => todayTask.value?.status !== 'DONE' || todayTask.value?.clozeAttempted || Boolean(attempt.value))
const generateHint = computed(() => {
  if (form.sourceType !== 'COMPLETED_GROUP' || completedGroupReady.value) return ''
  if (!taskDone.value) return '完成当前学习组后才能生成本组完形填空。'
  return '本组暂无可用于生成完形填空的单词。'
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
    if (!route.query.quizId && todayTask.value?.clozeQuizId && !todayTask.value?.clozeAttempted) {
      await loadQuizById(todayTask.value.clozeQuizId)
    }
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
  selectedBlankId.value = null
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
    ElMessage.warning('请先生成学习组')
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
      dailyTaskId: todayTask.value.taskId,
      sourceType: form.sourceType,
      targetWordCount: form.sourceType === 'COMPLETED_GROUP' ? 10 : form.targetWordCount,
    }, { silentError: true })
    const quizId = task.resultId
    if (!quizId) {
      throw new Error('完形填空生成成功，但没有返回题目 ID')
    }
    await loadQuizById(quizId)
    router.replace({ path: '/app/cloze', query: { quizId } })
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
  selectedBlankId.value = quiz.value?.blanks?.[0]?.blankId || null
  startedAt.value = Date.now()
}

async function submitAnswers() {
  if (!quiz.value?.quizId || !allAnswered.value) return
  submitting.value = true
  try {
    const durationSeconds = startedAt.value ? Math.max(0, Math.round((Date.now() - startedAt.value) / 1000)) : 0
    attempt.value = await submitClozeAttempt(quiz.value.quizId, {
      durationSeconds,
      answers: quiz.value.blanks.map((blank) => ({ blankId: blank.blankId, answer: answers[blank.blankId] })),
    })
    if (todayTask.value) {
      todayTask.value.clozeAttempted = true
    }
    ElMessage.success('答案已提交')
  } finally {
    submitting.value = false
  }
}

function selectAnswer(blank, word) {
  if (attempt.value) return
  answers[blank.blankId] = word
  selectedBlankId.value = blank.blankId
  advanceActiveBlank(blank.blankId)
}

function selectActiveAnswer(option) {
  if (attempt.value || !option?.word) return
  const blank = activeBlank.value || firstUnansweredBlank()
  if (!blank) return
  selectAnswer(blank, option.word)
}

function clearAnswer(blank) {
  if (attempt.value) return
  delete answers[blank.blankId]
  selectedBlankId.value = blank.blankId
}

function firstUnansweredBlank() {
  const blanks = quiz.value?.blanks || []
  return blanks.find((blank) => !answers[blank.blankId]) || blanks[0] || null
}

function setActiveBlank(blank) {
  if (attempt.value || !blank?.blankId) return
  selectedBlankId.value = blank.blankId
}

function advanceActiveBlank(currentBlankId) {
  const blanks = quiz.value?.blanks || []
  if (!blanks.length) return
  const currentIndex = blanks.findIndex((blank) => String(blank.blankId) === String(currentBlankId))
  const ordered = currentIndex >= 0
    ? [...blanks.slice(currentIndex + 1), ...blanks.slice(0, currentIndex + 1)]
    : blanks
  const next = ordered.find((blank) => !answers[blank.blankId])
  selectedBlankId.value = next?.blankId || currentBlankId
}

function isOptionUsed(word) {
  return Object.values(answers).includes(word)
}

function selectedOptionLabel(blankId) {
  const selectedWord = answers[blankId]
  const option = candidateOptions.value.find((candidate) => candidate.word === selectedWord)
  return option?.label || '未选择'
}

function inlineBlankLabel(blank) {
  const label = selectedOptionLabel(blank.blankId)
  return label === '未选择' ? `__${blank.blankNo}__` : label
}

function answerOptionLabel(word) {
  const option = candidateOptions.value.find((candidate) => candidate.word === word)
  return option ? `${option.label}. ${word}` : word
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
        <StarterPanel
          :title="needsPlan ? '先创建学习计划' : '暂时无法加载学习组'"
          :description="needsPlan ? '选择词库并设置每组新词和复习词后，就可以开始学习。' : (loadError || '请稍后重试，或检查后端服务。')"
          :icon="needsPlan ? Calendar : Refresh"
          :error="!needsPlan"
        >
          <el-button v-if="needsPlan" type="primary" @click="router.push('/app/plans')">创建计划</el-button>
          <el-button v-if="needsPlan" @click="router.push('/app/wordbooks')">选择词库</el-button>
          <el-button v-else type="primary" @click="loadTodayTask">重试</el-button>
        </StarterPanel>
      </el-card>

      <div v-else class="cloze-layout">
        <div class="cloze-main">
          <el-card class="panel-card" shadow="never">
            <template #header>
              <div class="card-header-row">
                <span>生成练习</span>
                <el-tag>{{ todayTask.plan?.wordbookName || '学习组' }}</el-tag>
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

            <div class="cloze-candidates">
              <button
                v-for="option in candidateOptions"
                :key="option.label"
                class="cloze-option"
                type="button"
                :class="{
                  selected: activeBlank && answers[activeBlank.blankId] === option.word,
                  used: isOptionUsed(option.word),
                }"
                :disabled="Boolean(attempt)"
                @click="selectActiveAnswer(option)"
              >
                <span>{{ option.label }}</span>
                {{ option.word }}
              </button>
            </div>

            <div class="cloze-passage">
              <template v-for="(part, index) in clozePassageParts" :key="index">
                <span v-if="part.type === 'text'">{{ part.text }}</span>
                <button
                  v-else
                  class="cloze-inline-blank"
                  type="button"
                  :class="{
                    active: !attempt && String(selectedBlankId) === String(part.blank.blankId),
                    answered: Boolean(answers[part.blank.blankId]),
                    correct: blankAnswer(part.blank.blankId)?.correct === true,
                    wrong: blankAnswer(part.blank.blankId)?.correct === false,
                  }"
                  :disabled="Boolean(attempt)"
                  @click="setActiveBlank(part.blank)"
                >
                  {{ inlineBlankLabel(part.blank) }}
                </button>
              </template>
            </div>

            <div class="cloze-answer-panel">
              <div class="blank-title-row">
                <strong>答案</strong>
                <el-tag :type="allAnswered ? 'success' : 'info'">{{ answeredCount }}/{{ quiz.blanks.length }}</el-tag>
              </div>
              <div class="cloze-answer-strip">
                <button
                  v-for="blank in quiz.blanks"
                  :key="blank.blankId"
                  class="cloze-answer-pill"
                  type="button"
                  :class="{
                    active: !attempt && String(selectedBlankId) === String(blank.blankId),
                    answered: Boolean(answers[blank.blankId]),
                    correct: blankAnswer(blank.blankId)?.correct === true,
                    wrong: blankAnswer(blank.blankId)?.correct === false,
                  }"
                  :disabled="Boolean(attempt)"
                  @click="setActiveBlank(blank)"
                >
                  <span>{{ blank.blankNo }}</span>
                  {{ selectedOptionLabel(blank.blankId) }}
                </button>
              </div>
              <div v-if="activeBlank && !attempt" class="cloze-active-line">
                <span>当前空格 {{ activeBlank.blankNo }}</span>
                <el-button v-if="answers[activeBlank.blankId]" text @click="clearAnswer(activeBlank)">清空</el-button>
              </div>
              <div v-if="attempt" class="cloze-result-list">
                <div v-for="blank in quiz.blanks" :key="`result-${blank.blankId}`" class="cloze-result-row">
                  <el-icon :class="blankAnswer(blank.blankId)?.correct ? 'result-correct' : 'result-wrong'">
                    <Check v-if="blankAnswer(blank.blankId)?.correct" />
                    <CircleClose v-else />
                  </el-icon>
                  <span>空格 {{ blank.blankNo }}</span>
                  <span>你的答案：{{ blankAnswer(blank.blankId)?.userAnswer || '未作答' }}</span>
                  <span>正确答案：{{ answerOptionLabel(blankAnswer(blank.blankId)?.correctAnswer) }}</span>
                  <span v-if="blankAnswer(blank.blankId)?.explanation" class="cloze-explanation">
                    {{ blankAnswer(blank.blankId).explanation }}
                  </span>
                </div>
              </div>
            </div>

            <div class="cloze-submit-row">
              <el-button :disabled="Boolean(attempt) || !allAnswered" type="primary" :loading="submitting" @click="submitAnswers">
                提交答案
              </el-button>
              <el-button v-if="attempt" type="primary" @click="router.push('/app/study')">继续下一组</el-button>
              <el-button v-if="attempt" @click="generateQuiz">再练一组</el-button>
            </div>
          </el-card>

          <el-card v-else class="panel-card mt-16" shadow="never">
            <EmptyState title="还没有练习" :description="generateError || '完成一组单词后，系统会优先用本组错词和复习词生成 10 空完形填空。'">
              <el-button type="primary" :loading="generating" :disabled="generateDisabled" @click="generateQuiz">生成练习</el-button>
              <el-button :disabled="!canContinueStudy" @click="router.push('/app/study')">
                去背单词
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </EmptyState>
          </el-card>
        </div>

        <el-card class="panel-card cloze-side" shadow="never">
          <template #header>第 {{ todayTask?.groupNo || 1 }} 组</template>
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
