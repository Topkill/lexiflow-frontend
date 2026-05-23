<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Calendar, ChatLineRound, Check, CircleClose, Refresh } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import StarterPanel from '../../components/StarterPanel.vue'
import { askWordQuestion, createClozeTask, fetchClozeAttemptAiReview, fetchClozeQuiz, submitClozeAttempt } from '../../api/ai'
import { createWrongWordPractice, fetchStudyTask, fetchTodayTask } from '../../api/study'
import { lookupWordInWordbook } from '../../api/wordbook'

const router = useRouter()
const route = useRoute()
const loadingTask = ref(false)
const generating = ref(false)
const submitting = ref(false)
const todayTask = ref(null)
const quiz = ref(null)
const attempt = ref(null)
const showCorrectAnswers = ref(false)
const needsPlan = ref(false)
const loadError = ref('')
const generateError = ref('')
const startedAt = ref(null)
const lookupVisible = ref(false)
const lookupWord = ref('')
const lookupLoading = ref(false)
const lookupResult = ref(null)
const lookupError = ref('')
const lookupSelectionVisible = ref(false)
const lookupSelectionText = ref('')
const lookupSelectionStyle = ref({ top: '0px', left: '0px' })
const passageRef = ref(null)
const resultRef = ref(null)
const clozeAiDialogVisible = ref(false)
const clozeAiLoading = ref(false)
const clozeAiRegenerating = ref(false)
const clozeAiQuestion = ref('')
const clozeAiResult = ref(null)
const clozeAiTarget = ref(null)
const clozeAiQuestionInputRef = ref(null)
const aiReviewState = ref('idle')
const aiReviewMessage = ref('')
const aiReviewText = ref('')
const aiReviewContent = ref(null)
const aiReviewError = ref('')
const aiReviewAttemptId = ref('')
const aiReviewCacheHit = ref(false)
const aiReviewMarkdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
let clozeClickTimer = null
let lookupSelectionRaf = null
let aiReviewAbortController = null
const form = reactive({
  sourceType: 'COMPLETED_GROUP',
  targetWordCount: 10,
})
const answers = reactive({})
const CLOZE_DRAFT_STORAGE_PREFIX = 'lexiflow:cloze-draft:'
const CLOZE_DRAFT_VERSION = 1
const queryTaskId = computed(() => route.query.taskId || '')
const isWrongPracticeTask = computed(() => todayTask.value?.taskType === 'WRONG_WORD_PRACTICE' || route.query.mode === 'wrong-practice')
const pageTitle = computed(() => (isWrongPracticeTask.value ? '错词完形填空' : 'AI 完形填空'))
const pageSubtitle = computed(() => (isWrongPracticeTask.value ? '基于本组错词生成选词填空，可选完成' : '基于今日新词和错词生成选词填空'))

const sourceOptions = computed(() => {
  if (isWrongPracticeTask.value) {
    return [{ label: '本组错词', value: 'COMPLETED_GROUP' }]
  }
  return [
    { label: '本组单词', value: 'COMPLETED_GROUP' },
    { label: '综合', value: 'MIXED' },
    { label: '今日新词', value: 'TODAY_NEW' },
    { label: '错词', value: 'WRONG_WORDS' },
  ]
})

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
const hasFilledAnswers = computed(() => answeredCount.value > 0)
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
const lookupDefinitions = computed(() => {
  if (!lookupResult.value) return []
  const fromTrans = normalizeLookupDefinitions(lookupResult.value.trans, lookupResult.value.primaryPos)
  if (fromTrans.length) return fromTrans
  const fallback = normalizeLookupText(lookupResult.value.primaryDefinition)
  return fallback
    ? [{ key: 'primary-definition', pos: normalizeLookupText(lookupResult.value.primaryPos), definitions: [fallback] }]
    : []
})
const lookupSentences = computed(() => normalizeLookupSentences(lookupResult.value?.sentences).slice(0, 2))
const passageZh = computed(() => normalizeLookupText(quiz.value?.passageZh))
const aiReviewHtml = computed(() => {
  if (!aiReviewText.value) return ''
  return aiReviewMarkdown.render(normalizeAiReviewMarkdown(aiReviewText.value))
})
const aiReviewTagType = computed(() => {
  if (aiReviewState.value === 'done') return aiReviewCacheHit.value ? 'success' : 'primary'
  if (aiReviewState.value === 'failed') return 'danger'
  if (aiReviewState.value === 'loading' || aiReviewState.value === 'streaming') return 'warning'
  return 'info'
})
const aiReviewTagLabel = computed(() => {
  if (aiReviewState.value === 'done') return aiReviewCacheHit.value ? '已缓存' : '已完成'
  if (aiReviewState.value === 'failed') return '失败'
  if (aiReviewState.value === 'streaming') return '输出中'
  if (aiReviewState.value === 'loading') return '生成中'
  return '等待生成'
})

function blankAnswer(blankId) {
  return wrongAnswerMap.value.get(String(blankId))
}

async function loadTodayTask() {
  if (generating.value) return
  loadingTask.value = true
  loadError.value = ''
  try {
    todayTask.value = queryTaskId.value ? await fetchStudyTask(queryTaskId.value) : await fetchTodayTask()
    if (!route.query.quizId && todayTask.value?.clozeQuizId && !todayTask.value?.clozeAttempted) {
      await loadQuizById(todayTask.value.clozeQuizId)
      if (route.query.generateError) {
        generateError.value = ''
        router.replace({ path: '/app/cloze', query: { quizId: todayTask.value.clozeQuizId } })
      }
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
  showCorrectAnswers.value = false
  selectedBlankId.value = null
  closeLookup()
  resetAiReviewState()
  Object.keys(answers).forEach((key) => delete answers[key])
}

function getClozeDraftStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function clozeDraftStorageKey(quizId = quiz.value?.quizId) {
  return quizId ? `${CLOZE_DRAFT_STORAGE_PREFIX}${quizId}` : ''
}

function serializeDraftAnswers() {
  const draftAnswers = {}
  ;(quiz.value?.blanks || []).forEach((blank) => {
    const value = answers[blank.blankId]
    if (value) {
      draftAnswers[String(blank.blankId)] = value
    }
  })
  return draftAnswers
}

function clearClozeDraft(quizId = quiz.value?.quizId) {
  const storage = getClozeDraftStorage()
  const key = clozeDraftStorageKey(quizId)
  if (!storage || !key) return
  try {
    storage.removeItem(key)
  } catch {
    // 本地存储不可用时，不影响当前练习流程。
  }
}

function saveClozeDraft() {
  if (!quiz.value?.quizId || attempt.value) return
  const storage = getClozeDraftStorage()
  const key = clozeDraftStorageKey()
  if (!storage || !key) return
  const draftAnswers = serializeDraftAnswers()
  if (!Object.keys(draftAnswers).length) {
    clearClozeDraft()
    return
  }
  try {
    storage.setItem(key, JSON.stringify({
      version: CLOZE_DRAFT_VERSION,
      quizId: String(quiz.value.quizId),
      selectedBlankId: selectedBlankId.value ? String(selectedBlankId.value) : '',
      answers: draftAnswers,
      updatedAt: Date.now(),
    }))
  } catch {
    // 本地存储写入失败时，用户仍可继续答题。
  }
}

function restoreClozeDraft() {
  const storage = getClozeDraftStorage()
  const key = clozeDraftStorageKey()
  if (!storage || !key || !quiz.value?.quizId) return false
  let draft
  try {
    draft = JSON.parse(storage.getItem(key) || 'null')
  } catch {
    clearClozeDraft()
    return false
  }
  if (!draft || String(draft.quizId) !== String(quiz.value.quizId) || !draft.answers) {
    return false
  }

  const validBlankIds = new Set((quiz.value.blanks || []).map((blank) => String(blank.blankId)))
  const validWords = new Set(candidateWords.value.map((word) => String(word)))
  let restoredCount = 0
  Object.entries(draft.answers).forEach(([blankId, word]) => {
    if (!validBlankIds.has(String(blankId)) || !word) return
    if (validWords.size && !validWords.has(String(word))) return
    answers[blankId] = word
    restoredCount += 1
  })

  if (!restoredCount) {
    clearClozeDraft()
    return false
  }

  const savedBlankId = draft.selectedBlankId ? String(draft.selectedBlankId) : ''
  selectedBlankId.value = validBlankIds.has(savedBlankId)
    ? savedBlankId
    : (firstUnansweredBlank()?.blankId || quiz.value.blanks?.[0]?.blankId || null)
  return true
}

function applyAttemptAnswers(attemptResult) {
  Object.keys(answers).forEach((key) => delete answers[key])
  ;(attemptResult?.answers || []).forEach((answer) => {
    if (answer?.blankId && answer.userAnswer) {
      answers[answer.blankId] = answer.userAnswer
    }
  })
  selectedBlankId.value = quiz.value?.blanks?.[0]?.blankId || null
}

function applyRouteGenerateError() {
  if (route.query.generateError === 'config') {
    generateError.value = 'AI 配置不可用，请先检查公共配置或私有配置。'
  } else if (route.query.generateError === 'ai') {
    generateError.value = 'AI 完形填空暂时生成失败，请稍后重试，或检查 AI 服务是否可访问。'
  }
}

async function generateQuiz() {
  if (generating.value) return
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
      targetWordCount: form.targetWordCount,
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
  attempt.value = quiz.value?.attempt || null
  if (attempt.value) {
    showCorrectAnswers.value = false
    applyAttemptAnswers(attempt.value)
    clearClozeDraft(quizId)
    void loadOrStartAiReview(attempt.value.attemptId)
  } else {
    const draftRestored = restoreClozeDraft()
    if (!draftRestored) {
      selectedBlankId.value = quiz.value?.blanks?.[0]?.blankId || null
    }
  }
  startedAt.value = Date.now()
}

async function submitAnswers() {
  if (!quiz.value?.quizId || !allAnswered.value || submitting.value || generating.value) return
  submitting.value = true
  try {
    const durationSeconds = startedAt.value ? Math.max(0, Math.round((Date.now() - startedAt.value) / 1000)) : 0
    attempt.value = await submitClozeAttempt(quiz.value.quizId, {
      durationSeconds,
      answers: quiz.value.blanks.map((blank) => ({ blankId: blank.blankId, answer: answers[blank.blankId] })),
    })
    showCorrectAnswers.value = false
    if (todayTask.value) {
      todayTask.value.clozeAttempted = true
    }
    clearClozeDraft()
    void startAiReviewStream(attempt.value.attemptId)
    ElMessage.success('答案已提交')
  } finally {
    submitting.value = false
  }
}

function resetAiReviewState() {
  abortAiReviewStream()
  aiReviewState.value = 'idle'
  aiReviewMessage.value = ''
  aiReviewText.value = ''
  aiReviewContent.value = null
  aiReviewError.value = ''
  aiReviewAttemptId.value = ''
  aiReviewCacheHit.value = false
}

function abortAiReviewStream() {
  if (!aiReviewAbortController) return
  aiReviewAbortController.abort()
  aiReviewAbortController = null
}

async function loadOrStartAiReview(attemptId) {
  const id = String(attemptId || '')
  if (!id) return
  if (aiReviewAttemptId.value === id && ['loading', 'streaming', 'done'].includes(aiReviewState.value)) return
  aiReviewAttemptId.value = id
  aiReviewError.value = ''
  try {
    const review = await fetchClozeAttemptAiReview(id)
    if (applyAiReviewResponse(review)) {
      return
    }
    if (review?.status === 'FAILED') {
      return
    }
  } catch {
    // 查询失败时继续尝试流式生成，避免刷新恢复被一次普通查询阻塞。
  }
  void startAiReviewStream(id)
}

function applyAiReviewResponse(review) {
  if (!review) return false
  aiReviewAttemptId.value = String(review.attemptId || aiReviewAttemptId.value || '')
  aiReviewContent.value = review.content || null
  aiReviewCacheHit.value = Boolean(review.cacheHit)
  if (review.status === 'DONE') {
    aiReviewState.value = 'done'
    aiReviewText.value = review.displayText || aiReviewText.value
    aiReviewError.value = ''
    return true
  }
  if (review.status === 'FAILED') {
    aiReviewState.value = 'failed'
    aiReviewError.value = review.errorMessage || 'AI 评阅生成失败，请稍后重试'
    return false
  }
  if (review.status === 'RUNNING') {
    aiReviewState.value = 'loading'
    aiReviewMessage.value = '正在生成 AI 评阅'
    return false
  }
  return false
}

function normalizeAiReviewMarkdown(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  return normalizeAiReviewMixedTextSpacing(trimmed)
    .replace(/^#{1,3}\s*AI\s*评阅\s*\n+/i, '')
    .replace(/^AI\s*评阅\s*\n+/i, '')
    .replace(/\n{3,}/g, '\n\n')
}

function normalizeAiReviewMixedTextSpacing(text) {
  return text
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
}

async function startAiReviewStream(attemptId, regenerate = false) {
  const id = String(attemptId || '')
  if (!id) return
  abortAiReviewStream()
  aiReviewAttemptId.value = id
  aiReviewState.value = 'loading'
  aiReviewMessage.value = '正在生成 AI 评阅'
  aiReviewText.value = ''
  aiReviewContent.value = null
  aiReviewError.value = ''
  aiReviewCacheHit.value = false
  const controller = new AbortController()
  aiReviewAbortController = controller
  try {
    const response = await fetch(buildAiReviewStreamUrl(id, regenerate), {
      method: 'GET',
      headers: buildAiReviewStreamHeaders(),
      signal: controller.signal,
      credentials: 'include',
    })
    if (!response.ok || !response.body) {
      throw new Error(await readAiReviewStreamError(response))
    }
    await readAiReviewSse(response)
    if (['loading', 'streaming'].includes(aiReviewState.value)) {
      aiReviewState.value = aiReviewText.value ? 'done' : 'idle'
    }
  } catch (error) {
    if (controller.signal.aborted) return
    aiReviewState.value = 'failed'
    aiReviewError.value = error?.message || 'AI 评阅生成失败，请稍后重试'
  } finally {
    if (aiReviewAbortController === controller) {
      aiReviewAbortController = null
    }
  }
}

function buildAiReviewStreamUrl(attemptId, regenerate = false) {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const query = regenerate ? '?regenerate=true' : ''
  return `${baseUrl}/api/v1/quizzes/cloze/attempts/${attemptId}/ai-review/stream${query}`
}

function buildAiReviewStreamHeaders() {
  const headers = { Accept: 'text/event-stream' }
  try {
    const token = window.localStorage.getItem('lexiflow_access_token')
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // localStorage 不可用时让后端按未登录处理。
  }
  return headers
}

async function readAiReviewStreamError(response) {
  try {
    const text = await response.text()
    const body = JSON.parse(text)
    return body?.message || `AI 评阅请求失败（${response.status}）`
  } catch {
    return `AI 评阅请求失败（${response.status}）`
  }
}

async function readAiReviewSse(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = consumeAiReviewSseBuffer(buffer)
  }
  buffer += decoder.decode()
  consumeAiReviewSseBuffer(buffer, true)
}

function consumeAiReviewSseBuffer(buffer, flush = false) {
  let rest = buffer.replace(/\r/g, '')
  let separatorIndex = rest.indexOf('\n\n')
  while (separatorIndex >= 0) {
    const block = rest.slice(0, separatorIndex).trim()
    rest = rest.slice(separatorIndex + 2)
    if (block) {
      handleAiReviewSseBlock(block)
    }
    separatorIndex = rest.indexOf('\n\n')
  }
  if (flush && rest.trim()) {
    handleAiReviewSseBlock(rest.trim())
    return ''
  }
  return rest
}

function handleAiReviewSseBlock(block) {
  const lines = block.split('\n')
  let event = 'message'
  const dataLines = []
  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  })
  const rawData = dataLines.join('\n')
  let data = rawData
  if (rawData) {
    try {
      data = JSON.parse(rawData)
    } catch {
      data = rawData
    }
  }
  handleAiReviewSseEvent(event, data)
}

function handleAiReviewSseEvent(event, data) {
  if (event === 'status') {
    aiReviewMessage.value = data?.message || '正在生成 AI 评阅'
    if (!aiReviewText.value) {
      aiReviewState.value = 'loading'
    }
    return
  }
  if (event === 'chunk') {
    const text = typeof data === 'string' ? data : (data?.text || '')
    if (text) {
      aiReviewState.value = 'streaming'
      aiReviewText.value += text
    }
    return
  }
  if (event === 'done') {
    applyAiReviewResponse(data)
    return
  }
  if (event === 'error') {
    aiReviewState.value = 'failed'
    aiReviewError.value = data?.message || 'AI 评阅生成失败，请稍后重试'
  }
}

async function continueWrongPractice() {
  if (generating.value || submitting.value) return
  try {
    const task = await createWrongWordPractice({ limit: 10 })
    if ((task.extraCount || 0) <= 0) {
      ElMessage.info('暂无可练习的错词')
      return
    }
    router.push({ path: '/app/study', query: { taskId: task.taskId, mode: 'wrong-practice' } })
  } catch (error) {
    ElMessage.info(error?.message || '暂无可练习的错词')
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

function scheduleClozeClick(handler) {
  clearClozeClickTimer()
  clozeClickTimer = window.setTimeout(() => {
    clozeClickTimer = null
    handler()
  }, 180)
}

function clearClozeClickTimer() {
  if (!clozeClickTimer) return
  window.clearTimeout(clozeClickTimer)
  clozeClickTimer = null
}

function handleOptionClick(option) {
  scheduleClozeClick(() => selectActiveAnswer(option))
}

function handleOptionDoubleClick(option) {
  clearClozeClickTimer()
  if (!attempt.value) return
  lookupByRawWord(option?.word)
}

function handleBlankClick(blank) {
  scheduleClozeClick(() => setActiveBlank(blank))
}

function handleBlankDoubleClick(blank) {
  clearClozeClickTimer()
  lookupByRawWord(lookupWordForDisplayedBlank(blank.blankId))
}

function clearAnswer(blank) {
  if (attempt.value) return
  delete answers[blank.blankId]
  selectedBlankId.value = blank.blankId
}

function clearAllAnswers() {
  if (attempt.value || !hasFilledAnswers.value) return
  Object.keys(answers).forEach((key) => delete answers[key])
  selectedBlankId.value = firstUnansweredBlank()?.blankId || null
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
  const selectedWord = answers[blankId] || blankAnswer(blankId)?.userAnswer
  const option = candidateOptions.value.find((candidate) => candidate.word === selectedWord)
  return option?.label || '未选择'
}

function displayedAnswerWord(blankId) {
  if (attempt.value && showCorrectAnswers.value) {
    const correctAnswer = blankAnswer(blankId)?.correctAnswer
    if (correctAnswer) {
      return correctAnswer
    }
  }
  return selectedOptionLabel(blankId)
}

function lookupWordForDisplayedBlank(blankId) {
  return attempt.value && showCorrectAnswers.value
    ? blankAnswer(blankId)?.correctAnswer || ''
    : ''
}

function inlineBlankLabel(blank) {
  const label = displayedAnswerWord(blank.blankId)
  return label === '未选择' ? `__${blank.blankNo}__` : label
}

function answerOptionLabel(word) {
  const option = candidateOptions.value.find((candidate) => candidate.word === word)
  return option ? `${option.label}. ${word}` : word
}

function blankCorrectAnswerLabel(blankId) {
  const answer = blankAnswer(blankId)
  return answerOptionLabel(answer?.correctAnswer)
}

function blankCorrectDefinition(blankId) {
  return blankAnswer(blankId)?.correctDefinitionZh || ''
}

function blankCorrectDefinitionLabel(blankId) {
  const answer = blankAnswer(blankId)
  const definition = normalizeLookupText(answer?.correctDefinitionZh)
  const pos = normalizeLookupText(answer?.correctAnswerPos)
  if (definition && pos) return `${definition}（${pos}）`
  return definition || pos
}

function blankCorrectDefinitions(blankId) {
  return Array.isArray(blankAnswer(blankId)?.correctDefinitions)
    ? blankAnswer(blankId).correctDefinitions
    : []
}

function blankReasonZh(blankId) {
  return blankAnswer(blankId)?.reasonZh || ''
}

function formatDefinitionGroup(group) {
  if (!group) return ''
  const pos = normalizeLookupText(group.pos)
  const definitions = Array.isArray(group.definitions)
    ? group.definitions.map(normalizeLookupText).filter(Boolean)
    : []
  const text = definitions.join('；')
  if (pos && text) return `${pos} ${text}`
  return pos || text
}

function openClozeAiQuestion(blank) {
  if (!blank?.wordId || !blank?.blankNo) return
  clozeAiTarget.value = {
    ...blank,
    word: blankAnswer(blank.blankId)?.correctAnswer || '',
  }
  clozeAiQuestion.value = `请结合这道完形填空的答案解析，解释空格 ${blank.blankNo} 为什么选这个词。`
  clozeAiResult.value = null
  clozeAiDialogVisible.value = true
  nextTick(() => clozeAiQuestionInputRef.value?.focus?.())
}

function openFirstClozeAiQuestion() {
  const firstBlank = (quiz.value?.blanks || []).find((blank) => blank?.wordId)
  if (firstBlank) {
    openClozeAiQuestion(firstBlank)
  }
}

function insertClozeAiQuestionText(text) {
  const insertText = String(text || '').trim()
  if (!insertText) return
  clozeAiQuestion.value = clozeAiQuestion.value ? `${clozeAiQuestion.value} ${insertText}`.trim() : insertText
  nextTick(() => clozeAiQuestionInputRef.value?.focus?.())
}

function closeClozeAiDialog() {
  clozeAiDialogVisible.value = false
  clozeAiLoading.value = false
  clozeAiRegenerating.value = false
}

async function askClozeAi(regenerate = false) {
  if (!clozeAiTarget.value?.wordId || !quiz.value?.wordbookId || clozeAiLoading.value || clozeAiRegenerating.value) return
  const question = clozeAiQuestion.value.trim()
  if (!question) {
    ElMessage.warning('请输入你想问的问题')
    return
  }
  clozeAiLoading.value = !regenerate
  clozeAiRegenerating.value = regenerate
  try {
    clozeAiResult.value = await askWordQuestion(
      clozeAiTarget.value.wordId,
      {
        wordbookId: quiz.value.wordbookId,
        question,
        regenerate,
      },
      { silentError: true },
    )
  } catch (error) {
    ElMessage.warning(error.code === 40001
      ? 'AI 配置不可用，请先检查公共配置或私有配置。'
      : 'AI 问答暂时不可用，请稍后重试。')
  } finally {
    clozeAiLoading.value = false
    clozeAiRegenerating.value = false
  }
}

function useClozeFollowUp(question) {
  clozeAiQuestion.value = question
  askClozeAi(false)
}

function toggleRevealCorrectAnswers() {
  if (!attempt.value) return
  showCorrectAnswers.value = !showCorrectAnswers.value
}

function handlePassageSelectionChange() {
  scheduleLookupSelectionUpdate()
}

function scheduleLookupSelectionUpdate() {
  if (lookupSelectionRaf) {
    window.cancelAnimationFrame(lookupSelectionRaf)
  }
  lookupSelectionRaf = window.requestAnimationFrame(() => {
    lookupSelectionRaf = null
    updateLookupSelection()
  })
}

function updateLookupSelection() {
  const passage = passageRef.value
  const result = resultRef.value
  const selection = window.getSelection?.()
  if ((!passage && !result) || !selection || selection.isCollapsed || !selection.rangeCount) {
    hideLookupSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const commonAncestor = range.commonAncestorContainer?.nodeType === 3
    ? range.commonAncestorContainer.parentElement
    : range.commonAncestorContainer
  const withinLookupArea = (passage && passage.contains(commonAncestor)) || (result && result.contains(commonAncestor))
  if (!commonAncestor || !withinLookupArea) {
    hideLookupSelection()
    return
  }

  const text = normalizeLookupSelectionText(selection.toString())
  if (!text) {
    hideLookupSelection()
    return
  }

  const rect = range.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) {
    hideLookupSelection()
    return
  }

  lookupSelectionText.value = text
  lookupSelectionStyle.value = buildLookupSelectionStyle(rect)
  lookupSelectionVisible.value = true
}

function buildLookupSelectionStyle(rect) {
  const buttonWidth = 78
  const buttonHeight = 34
  const padding = 8
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 720
  let left = rect.left + rect.width / 2 - buttonWidth / 2
  left = Math.max(padding, Math.min(left, viewportWidth - buttonWidth - padding))
  let top = rect.top - buttonHeight - 8
  if (top < padding) {
    top = rect.bottom + 8
  }
  top = Math.max(padding, Math.min(top, viewportHeight - buttonHeight - padding))
  return {
    left: `${left}px`,
    top: `${top}px`,
  }
}

function normalizeLookupSelectionText(value) {
  if (!value) return ''
  return String(value).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
}

function hideLookupSelection() {
  lookupSelectionVisible.value = false
  lookupSelectionText.value = ''
}

function handleLookupSelectionLookup() {
  if (!lookupSelectionText.value) return
  lookupByRawWord(lookupSelectionText.value)
}

function cleanLookupText(value) {
  if (!value) return ''
  return normalizeLookupSelectionText(value)
}

async function lookupByRawWord(rawWord) {
  const word = cleanLookupText(rawWord)
  if (!word) return
  if (!quiz.value?.wordbookId) {
    ElMessage.warning('当前练习缺少词库信息，暂时无法查词')
    return
  }
  lookupVisible.value = true
  lookupWord.value = word
  lookupResult.value = null
  lookupError.value = ''
  lookupLoading.value = true
  try {
    lookupResult.value = await lookupWordInWordbook(quiz.value.wordbookId, word)
    lookupError.value = lookupResult.value ? '' : '未找到该单词或词组'
  } catch (error) {
    lookupError.value = error?.code === 20002 || error?.code === 10002 || error?.code === 404
      ? '未找到该单词或词组'
      : (error?.message || '查词失败，请稍后重试')
  } finally {
    lookupLoading.value = false
  }
}

function closeLookup() {
  lookupVisible.value = false
  lookupWord.value = ''
  lookupResult.value = null
  lookupError.value = ''
  lookupLoading.value = false
}

function parseLookupJson(value) {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return null
  if (!text.startsWith('{') && !text.startsWith('[')) return text
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeLookupText(value) {
  if (value == null || typeof value === 'boolean') return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeLookupDefinitions(value, inheritedPos = '') {
  const parsed = parseLookupJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed.map((item, index) => {
    if (typeof item === 'string') {
      return { key: `definition-${index}`, pos: normalizeLookupText(inheritedPos), definitions: [normalizeLookupText(item)] }
    }
    if (!item || typeof item !== 'object') return null
    const pos = normalizeLookupText(item.pos || item.partOfSpeech || item.part_of_speech || inheritedPos)
    const definitions = []
    ;['cn', 'definition', 'definitionZh', 'zh', 'chinese', 'meaning'].forEach((field) => {
      const text = normalizeLookupText(item[field])
      if (text) definitions.push(text)
    })
    if (Array.isArray(item.definitions)) {
      item.definitions.map(normalizeLookupText).filter(Boolean).forEach((text) => definitions.push(text))
    }
    const uniqueDefinitions = [...new Set(definitions)]
    return uniqueDefinitions.length ? { key: `definition-${index}-${pos || 'text'}`, pos, definitions: uniqueDefinitions } : null
  }).filter(Boolean)
}

function normalizeLookupSentences(value) {
  const parsed = parseLookupJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed.map((sentence, index) => {
    if (typeof sentence === 'string') {
      return { key: `sentence-${index}`, english: normalizeLookupText(sentence), chinese: '' }
    }
    if (!sentence || typeof sentence !== 'object') return null
    const english = normalizeLookupText(sentence.c || sentence.en || sentence.english || sentence.sentence)
    const chinese = normalizeLookupText(sentence.cn || sentence.zh || sentence.chinese || sentence.translation)
    return english ? { key: `sentence-${index}-${english}`, english, chinese } : null
  }).filter(Boolean)
}

watch(
  () => [
    quiz.value?.quizId || '',
    selectedBlankId.value || '',
    ...(quiz.value?.blanks || []).map((blank) => answers[blank.blankId] || ''),
  ],
  () => saveClozeDraft()
)

onMounted(async () => {
  await loadTodayTask()
  applyRouteGenerateError()
  if (route.query.quizId) {
    await loadQuizById(route.query.quizId)
  }
  document.addEventListener('selectionchange', handlePassageSelectionChange)
  window.addEventListener('scroll', scheduleLookupSelectionUpdate, true)
  window.addEventListener('resize', scheduleLookupSelectionUpdate)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', handlePassageSelectionChange)
  window.removeEventListener('scroll', scheduleLookupSelectionUpdate, true)
  window.removeEventListener('resize', scheduleLookupSelectionUpdate)
  if (lookupSelectionRaf) {
    window.cancelAnimationFrame(lookupSelectionRaf)
    lookupSelectionRaf = null
  }
  abortAiReviewStream()
  clearClozeClickTimer()
})
</script>

<template>
  <section>
    <PageHeader :title="pageTitle" :subtitle="pageSubtitle">
      <el-button :icon="Refresh" :disabled="generating" @click="loadTodayTask">刷新任务</el-button>
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
              <el-form-item label="生成来源" class="cloze-source-field">
                <el-segmented v-model="form.sourceType" :options="sourceOptions" />
              </el-form-item>
              <div class="cloze-target-actions">
                <el-form-item label="目标词数" class="cloze-target-field">
                  <el-input-number v-model="form.targetWordCount" :min="5" :max="10" :step="1" controls-position="right" />
                </el-form-item>
                <el-button type="primary" :loading="generating" :disabled="generateDisabled" @click="generateQuiz">
                  {{ quiz ? '重新生成练习' : '生成练习' }}
                </el-button>
              </div>
            </el-form>
            <el-alert v-if="generateHint" class="mt-16" type="info" :title="generateHint" :closable="false" />
            <el-alert v-if="generateError" class="mt-16" type="warning" :title="generateError" :closable="false" />
          </el-card>

          <el-card v-if="generating" class="panel-card mt-16 cloze-generating-card" shadow="never">
            <div class="cloze-generating-visual" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div>
              <strong>正在生成必做完形填空</strong>
              <p>AI 正在组织英文短文，系统会自动挖空并校验答案。</p>
            </div>
          </el-card>

          <el-card v-if="quiz" class="panel-card mt-16" shadow="never">
            <template #header>
              <div class="card-header-row">
                <span>{{ quiz.title || '完形填空练习' }}</span>
                <div v-if="attempt" class="cloze-card-actions">
                  <el-button
                    size="small"
                    plain
                    :icon="ChatLineRound"
                    :disabled="!(quiz.blanks || []).some((blank) => blank.wordId)"
                    class="cloze-card-ai-button"
                    @click="openFirstClozeAiQuestion"
                  >
                    AI 问答
                  </el-button>
                  <el-tag :type="attempt.wrongCount ? 'warning' : 'success'">
                    得分 {{ attempt.score }}
                  </el-tag>
                </div>
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
                  locked: Boolean(attempt),
                }"
                :aria-disabled="Boolean(attempt)"
                @click="handleOptionClick(option)"
                @dblclick.stop.prevent="handleOptionDoubleClick(option)"
              >
                <span>{{ option.label }}</span>
                {{ option.word }}
              </button>
            </div>

            <div
              ref="passageRef"
              class="cloze-passage"
              @mouseup="handlePassageSelectionChange"
              @keyup="handlePassageSelectionChange"
            >
              <template v-for="(part, index) in clozePassageParts" :key="index">
                <span v-if="part.type === 'text'">{{ part.text }}</span>
                <button
                  v-else
                  class="cloze-inline-blank"
                  type="button"
                  :class="{
                    active: !attempt && String(selectedBlankId) === String(part.blank.blankId),
                    answered: Boolean(answers[part.blank.blankId]),
                    revealed: Boolean(attempt && showCorrectAnswers),
                    correct: !showCorrectAnswers && blankAnswer(part.blank.blankId)?.correct === true,
                    wrong: !showCorrectAnswers && blankAnswer(part.blank.blankId)?.correct === false,
                    locked: Boolean(attempt),
                  }"
                  :aria-disabled="Boolean(attempt)"
                  @click="handleBlankClick(part.blank)"
                  @dblclick.stop.prevent="handleBlankDoubleClick(part.blank)"
                >
                  {{ inlineBlankLabel(part.blank) }}
                </button>
              </template>
            </div>

            <div v-if="attempt && passageZh" class="cloze-passage-translation">
              <strong>短文翻译</strong>
              <p>{{ passageZh }}</p>
            </div>

            <button
              v-if="lookupSelectionVisible"
              class="cloze-lookup-float"
              type="button"
              :style="lookupSelectionStyle"
              @mousedown.prevent
              @click="handleLookupSelectionLookup"
            >
              查词
            </button>

            <div class="cloze-answer-panel">
              <div class="blank-title-row">
                <strong>答案</strong>
                <div class="blank-title-actions">
                  <el-tag :type="allAnswered ? 'success' : 'info'">{{ answeredCount }}/{{ quiz.blanks.length }}</el-tag>
                  <el-button
                    v-if="attempt"
                    size="small"
                    :type="showCorrectAnswers ? 'warning' : 'primary'"
                    plain
                    @click="toggleRevealCorrectAnswers"
                  >
                    {{ showCorrectAnswers ? '恢复原答案' : '显示正确答案' }}
                  </el-button>
                </div>
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
                    revealed: Boolean(attempt && showCorrectAnswers),
                    correct: !showCorrectAnswers && blankAnswer(blank.blankId)?.correct === true,
                    wrong: !showCorrectAnswers && blankAnswer(blank.blankId)?.correct === false,
                    locked: Boolean(attempt),
                  }"
                  :aria-disabled="Boolean(attempt)"
                  @click="handleBlankClick(blank)"
                  @dblclick.stop.prevent="handleBlankDoubleClick(blank)"
                >
                  <span>{{ blank.blankNo }}</span>
                  {{ displayedAnswerWord(blank.blankId) }}
                </button>
              </div>
              <div v-if="activeBlank && !attempt" class="cloze-active-line">
                <span class="cloze-active-label">当前空格 {{ activeBlank.blankNo }}</span>
                <div class="cloze-active-actions">
                  <el-button
                    text
                    :disabled="!answers[activeBlank.blankId]"
                    @click="clearAnswer(activeBlank)"
                  >
                    清空
                  </el-button>
                  <el-button v-if="hasFilledAnswers" text @click="clearAllAnswers">全部清空</el-button>
                </div>
              </div>
              <div v-if="attempt" ref="resultRef" class="cloze-result-list" @mouseup="handlePassageSelectionChange" @keyup="handlePassageSelectionChange">
                <div
                  v-for="blank in quiz.blanks"
                  :key="`result-${blank.blankId}`"
                  class="cloze-result-row"
                  :class="{ 'is-correct': blankAnswer(blank.blankId)?.correct, 'is-wrong': blankAnswer(blank.blankId)?.correct === false }"
                >
                  <el-icon :class="blankAnswer(blank.blankId)?.correct ? 'result-correct' : 'result-wrong'">
                    <Check v-if="blankAnswer(blank.blankId)?.correct" />
                    <CircleClose v-else />
                  </el-icon>
                  <div class="cloze-result-meta">
                    <div class="cloze-result-line">
                      <span class="cloze-result-label">空格 {{ blank.blankNo }}</span>
                      <span>你的答案：{{ blankAnswer(blank.blankId)?.userAnswer || '未作答' }}</span>
                      <el-button
                        v-if="blank.wordId"
                        size="small"
                        plain
                        :icon="ChatLineRound"
                        class="cloze-result-ai-button"
                        @click="openClozeAiQuestion(blank)"
                      >
                        AI 问答
                      </el-button>
                    </div>
                    <div class="cloze-result-line">
                      <span>正确答案：{{ blankCorrectAnswerLabel(blank.blankId) }}</span>
                      <span v-if="blankCorrectDefinitionLabel(blank.blankId)">本题释义：{{ blankCorrectDefinitionLabel(blank.blankId) }}</span>
                    </div>
                    <div v-if="blankCorrectDefinitions(blank.blankId).length" class="cloze-result-definitions">
                      <span class="cloze-result-label">全部释义：</span>
                      <span
                        v-for="(definition, index) in blankCorrectDefinitions(blank.blankId)"
                        :key="`${blank.blankId}-definition-${index}`"
                        class="cloze-result-definition-item"
                      >
                        {{ formatDefinitionGroup(definition) }}
                      </span>
                    </div>
                    <div v-if="blankReasonZh(blank.blankId)" class="cloze-result-reason">
                      选择原因：{{ blankReasonZh(blank.blankId) }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="attempt" class="cloze-ai-review-panel">
                <div class="blank-title-row">
                  <strong>AI 评阅</strong>
                  <div class="blank-title-actions">
                    <el-tag :type="aiReviewTagType">{{ aiReviewTagLabel }}</el-tag>
                    <el-button
                      v-if="aiReviewState === 'failed'"
                      size="small"
                      plain
                      :disabled="submitting || generating"
                      @click="startAiReviewStream(attempt.attemptId, true)"
                    >
                      重新生成
                    </el-button>
                  </div>
                </div>
                <div class="cloze-ai-review-text" :class="`is-${aiReviewState}`">
                  <template v-if="aiReviewState === 'loading' && !aiReviewText">
                    <span>{{ aiReviewMessage || '正在生成 AI 评阅...' }}</span>
                  </template>
                  <template v-else-if="aiReviewState === 'failed'">
                    <span>{{ aiReviewError || 'AI 评阅生成失败，请稍后重试。' }}</span>
                  </template>
                  <template v-else>
                    <div
                      v-if="aiReviewHtml"
                      class="cloze-ai-review-markdown"
                      v-html="aiReviewHtml"
                    />
                    <span v-else>{{ aiReviewText || 'AI 评阅尚未生成。' }}</span>
                  </template>
                </div>
              </div>
            </div>

            <div class="cloze-submit-row">
              <el-button v-if="!attempt" :disabled="!allAnswered || submitting || generating" type="primary" :loading="submitting" @click="submitAnswers">
                提交答案
              </el-button>
              <template v-if="attempt && isWrongPracticeTask">
                <el-button type="primary" @click="router.push('/app/wrong-words')">返回错词本</el-button>
                <el-button :loading="generating" :disabled="generating" @click="continueWrongPractice">继续下一组</el-button>
              </template>
              <el-button v-else-if="attempt" type="primary" @click="router.push('/app/study')">继续下一组</el-button>
            </div>
          </el-card>

          <el-card v-else class="panel-card mt-16" shadow="never">
            <EmptyState
              title="还没有练习"
              :description="generateError || (isWrongPracticeTask ? '可以基于本组错词生成 10 空完形填空。' : '完成一组单词后，系统会优先用本组错词和复习词生成 10 空完形填空。')"
            >
              <el-button type="primary" :loading="generating" :disabled="generateDisabled" @click="generateQuiz">生成练习</el-button>
              <el-button v-if="isWrongPracticeTask" @click="router.push('/app/wrong-words')">返回错词本</el-button>
              <el-button v-else :disabled="!canContinueStudy" @click="router.push('/app/study')">
                去背单词
                <el-icon><ArrowRight /></el-icon>
              </el-button>
            </EmptyState>
          </el-card>
        </div>

      </div>
    </template>

    <el-dialog v-model="lookupVisible" class="cloze-lookup-dialog" width="420px" append-to-body @closed="closeLookup">
      <template #header>
        <div class="cloze-lookup-header">
          <strong>{{ lookupResult?.word || lookupWord }}</strong>
          <span v-if="lookupResult?.normalizedWord && lookupResult.normalizedWord !== lookupResult.word">
            {{ lookupResult.normalizedWord }}
          </span>
        </div>
      </template>

      <el-skeleton v-if="lookupLoading" :rows="4" animated />
      <el-empty v-else-if="lookupError" :description="lookupError" :image-size="72" />
      <div v-else-if="lookupResult" class="cloze-lookup-content">
        <div v-if="lookupResult.phonetic0 || lookupResult.phonetic1" class="cloze-lookup-phonetics">
          <span v-if="lookupResult.phonetic0">英 {{ lookupResult.phonetic0 }}</span>
          <span v-if="lookupResult.phonetic1">美 {{ lookupResult.phonetic1 }}</span>
        </div>

        <div v-if="lookupDefinitions.length" class="cloze-lookup-section">
          <div v-for="definition in lookupDefinitions" :key="definition.key" class="cloze-lookup-definition">
            <span v-if="definition.pos">{{ definition.pos }}</span>
            <p>{{ definition.definitions.join('；') }}</p>
          </div>
        </div>

        <div v-if="lookupSentences.length" class="cloze-lookup-section">
          <div v-for="sentence in lookupSentences" :key="sentence.key" class="cloze-lookup-sentence">
            <p>{{ sentence.english }}</p>
            <span v-if="sentence.chinese">{{ sentence.chinese }}</span>
          </div>
        </div>

        <p v-if="!lookupDefinitions.length && !lookupSentences.length" class="cloze-lookup-muted">
          暂无更多释义或例句信息。
        </p>
      </div>
    </el-dialog>

    <el-dialog
      v-model="clozeAiDialogVisible"
      title="AI 问答"
      width="680px"
      @closed="closeClozeAiDialog"
    >
      <div class="ai-question-box">
        <div class="ai-question-word">
          <el-tooltip content="点击插入" effect="light" placement="top">
            <el-tag @click="insertClozeAiQuestionText(clozeAiTarget?.word)">{{ clozeAiTarget?.word }}</el-tag>
          </el-tooltip>
          <span v-if="clozeAiTarget">空格 {{ clozeAiTarget.blankNo }}</span>
        </div>
        <el-input
          ref="clozeAiQuestionInputRef"
          v-model.trim="clozeAiQuestion"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="输入你对这道解析的疑问，例如：为什么这里不用另一个词性？"
        />
        <div class="button-row">
          <el-button :icon="Refresh" @click="closeClozeAiDialog">关闭</el-button>
          <el-button type="primary" :loading="clozeAiLoading" :disabled="clozeAiLoading || clozeAiRegenerating" @click="askClozeAi(false)">提问</el-button>
        </div>
      </div>

      <el-skeleton v-if="clozeAiLoading" :rows="5" animated />
      <template v-else-if="clozeAiResult?.content">
        <div class="ai-content-panel">
          <div class="card-header-row">
            <el-tag :type="clozeAiResult.cacheHit ? 'success' : 'info'">{{ clozeAiResult.cacheHit ? '缓存命中' : '新生成' }}</el-tag>
            <el-button size="small" :icon="Refresh" :loading="clozeAiRegenerating" :disabled="clozeAiLoading || clozeAiRegenerating" @click="askClozeAi(true)">重新回答</el-button>
          </div>

          <p class="ai-brief">{{ clozeAiResult.content.answer }}</p>
          <div v-if="clozeAiResult.content.keyPoints?.length" class="ai-section">
            <h3>要点</h3>
            <ul><li v-for="item in clozeAiResult.content.keyPoints" :key="item">{{ item }}</li></ul>
          </div>
          <div v-if="clozeAiResult.content.relatedWords?.length" class="ai-section">
            <h3>相关词</h3>
            <div class="ai-tag-row">
              <el-tag v-for="item in clozeAiResult.content.relatedWords" :key="item" effect="plain">{{ item }}</el-tag>
            </div>
          </div>
          <div v-if="clozeAiResult.content.followUps?.length" class="ai-section">
            <h3>继续追问</h3>
            <div class="ai-follow-row">
              <el-button v-for="item in clozeAiResult.content.followUps" :key="item" size="small" plain @click="useClozeFollowUp(item)">
                {{ item }}
              </el-button>
            </div>
          </div>
        </div>
      </template>
      <EmptyState v-else title="还没有提问" description="可以针对这道答案解析继续追问。比如：为什么这里选这个词、这个词性怎么判断。">
        <el-button type="primary" :loading="clozeAiLoading" :disabled="clozeAiLoading || clozeAiRegenerating" @click="askClozeAi(false)">开始提问</el-button>
      </EmptyState>
    </el-dialog>
  </section>
</template>
