<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, ChatLineRound, Cpu, Refresh } from '@element-plus/icons-vue'
import LexiIcon from '../../components/LexiIcon.vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import StarterPanel from '../../components/StarterPanel.vue'
import { askWordQuestion, createClozeTask } from '../../api/ai'
import { deleteFavoriteWord, favoriteWord } from '../../api/review'
import { fetchTaskItemCard, fetchTodayTask, submitTaskFeedback } from '../../api/study'
import { useAuthStore } from '../../stores/auth'
import {
  cleanupExpiredStudyFlowStates,
  readStudyFlowState,
  removeStudyFlowState,
  writeStudyFlowState,
} from '../../utils/studyFlowStorage'

const FLOW_SEGMENT = 'segment'
const FLOW_RETRY = 'retry'
const PHASE_LEARN = 'learn'
const PHASE_CONFIRM = 'confirm'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const generatingCloze = ref(false)
const favoriteOperating = ref(false)
const task = ref(null)
const itemBatches = ref([])
const segmentIndex = ref(0)
const activeIndex = ref(0)
const flowMode = ref(FLOW_SEGMENT)
const phase = ref(PHASE_LEARN)
const retryItems = ref([])
const nextRetryItems = ref([])
const missedItems = ref([])
const failedFeedbackItemIds = ref(new Set())
const card = ref(null)
const emptyTitle = ref('暂无待学习卡片')
const emptyDescription = ref('本组完成后可以继续下一组，也可以回到首页查看统计。')
const needsPlan = ref(false)
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const aiRegenerating = ref(false)
const aiResult = ref(null)
const aiQuestion = ref('')
const pronunciationLoadingType = ref('')
let pronunciationAudio = null

const pendingItems = computed(() => task.value?.items?.filter((item) => item.status === 'PENDING') || [])
const currentSegmentItems = computed(() => itemBatches.value[segmentIndex.value] || [])
const activeItems = computed(() => (flowMode.value === FLOW_RETRY ? retryItems.value : currentSegmentItems.value))
const currentItem = computed(() => activeItems.value[activeIndex.value])
const segmentCount = computed(() => itemBatches.value.length)
const totalItemCount = computed(() => task.value?.progress?.totalCount ?? task.value?.items?.length ?? 0)
const completedItemCount = computed(() => task.value?.progress?.doneCount ?? task.value?.doneCount ?? 0)
const studyCompletionRate = computed(() => (
  totalItemCount.value > 0
    ? Math.min(100, Math.round((completedItemCount.value / totalItemCount.value) * 100))
    : 0
))
function todayDateString() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isLegacyPendingTask = computed(() => {
  if (!task.value?.taskDate || task.value?.status !== 'PENDING') return false
  return String(task.value.taskDate) < todayDateString()
})
const recallMode = computed(() => phase.value === PHASE_CONFIRM)
const learningMode = computed(() => phase.value === PHASE_LEARN)
const pageSubtitle = computed(() => {
  const groupLabel = `第 ${task.value?.groupNo || 1} 组`
  if (isLegacyPendingTask.value) {
    return `${groupLabel}：继续未完成学习组，完成后再进入必做完形填空`
  }
  return `${groupLabel}：分段学习、轻量回忆，再进入必做完形填空`
})
const flowTitle = computed(() => (flowMode.value === FLOW_RETRY ? '回看没记住的词' : `第 ${segmentIndex.value + 1}/${segmentCount.value || 1} 段`))
const phaseTitle = computed(() => (learningMode.value ? '完整学习' : '轻量回忆'))
const cardPositionLabel = computed(() => `${Math.min(activeIndex.value + 1, activeItems.value.length || 1)}/${activeItems.value.length || 0}`)
const learnActionLabel = computed(() => {
  if (flowMode.value === FLOW_RETRY) return '我再回忆一次'
  return activeIndex.value >= activeItems.value.length - 1 ? '开始回忆' : '下一个'
})
const flowHint = computed(() => {
  if (generatingCloze.value) return '本组单词学习已完成，正在生成必做完形填空。'
  if (flowMode.value === FLOW_RETRY) return '这些是刚才没记住的词，先看完整信息，再重新回忆。'
  return learningMode.value ? '先快速理解本段单词，随后会折叠中文释义做轻量回忆。' : '现在只看英文信息，确认自己能不能想起中文意思。'
})
const aiQuestionPlaceholder = computed(() => card.value?.word ? `例如：${card.value.word} 的反义词有哪些？` : '例如：这个词的反义词有哪些？')
const cardDefinitions = computed(() => {
  const transDefinitions = normalizeDefinitionEntries(card.value?.trans, card.value?.primaryPos)
  if (transDefinitions.length) return transDefinitions

  const fallbackDefinition = normalizeDefinitionText(card.value?.primaryDefinition)
  if (!fallbackDefinition) return []
  return [{
    key: 'primary-definition',
    pos: normalizeDefinitionText(card.value?.primaryPos),
    definitions: [fallbackDefinition],
  }]
})
const cardSentences = computed(() => {
  if (!card.value?.sentences) return []
  try {
    const sentences = typeof card.value.sentences === 'string' ? JSON.parse(card.value.sentences) : card.value.sentences
    return Array.isArray(sentences)
      ? sentences.slice(0, 3).map((sentence, index) => {
        const phrase = extractExamplePhrase(sentence.c, card.value?.word)
        return {
          ...sentence,
          key: `${index}-${sentence.c || ''}`,
          phrase,
          highlightedEnglish: highlightExampleText(sentence.c, card.value?.word, phrase),
        }
      })
      : []
  } catch {
    return []
  }
})

const POS_FIELD_NAMES = ['pos', 'partOfSpeech', 'part_of_speech']
const TEXT_DEFINITION_FIELD_NAMES = ['cn', 'definition', 'definitionZh', 'zh', 'chinese', 'meaning']

function parseJsonLike(value) {
  if (typeof value !== 'string') return { valid: true, value }
  const text = value.trim()
  if (!text) return { valid: true, value: null }
  if (!text.startsWith('{') && !text.startsWith('[')) return { valid: true, value: text }
  try {
    return { valid: true, value: JSON.parse(text) }
  } catch {
    return { valid: false, value: null }
  }
}

function normalizeDefinitionText(value) {
  if (value == null || typeof value === 'boolean') return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

function readFirstTextField(source, fieldNames) {
  const field = fieldNames.find((name) => Object.prototype.hasOwnProperty.call(source, name))
  return field ? normalizeDefinitionText(source[field]) : ''
}

function uniqueTexts(values) {
  const seen = new Set()
  return values.reduce((items, value) => {
    const text = normalizeDefinitionText(value)
    if (text && !seen.has(text)) {
      seen.add(text)
      items.push(text)
    }
    return items
  }, [])
}

function isObjectLike(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isNestedDefinitionValue(value) {
  const parsed = parseJsonLike(value)
  if (!parsed.valid || parsed.value == null) return false
  if (Array.isArray(parsed.value)) {
    return parsed.value.some((item) => isObjectLike(parseJsonLike(item).value))
  }
  return isObjectLike(parsed.value)
}

function definitionTextsFromValue(value) {
  const parsed = parseJsonLike(value)
  if (!parsed.valid || parsed.value == null) return []

  if (Array.isArray(parsed.value)) {
    return uniqueTexts(parsed.value.flatMap((item) => definitionTextsFromValue(item)))
  }

  if (isObjectLike(parsed.value)) {
    return uniqueTexts(TEXT_DEFINITION_FIELD_NAMES.flatMap((field) => (
      Object.prototype.hasOwnProperty.call(parsed.value, field)
        ? definitionTextsFromValue(parsed.value[field])
        : []
    )))
  }

  return uniqueTexts([parsed.value])
}

function collectDefinitionRows(value, inheritedPos = '') {
  const parsed = parseJsonLike(value)
  if (!parsed.valid || parsed.value == null) return []

  if (Array.isArray(parsed.value)) {
    return parsed.value.flatMap((item) => collectDefinitionRows(item, inheritedPos))
  }

  if (!isObjectLike(parsed.value)) {
    const text = normalizeDefinitionText(parsed.value)
    return text ? [{ pos: inheritedPos, definitions: [text] }] : []
  }

  const source = parsed.value
  const pos = readFirstTextField(source, POS_FIELD_NAMES) || inheritedPos
  const rows = []
  const directDefinitions = TEXT_DEFINITION_FIELD_NAMES.flatMap((field) => (
    Object.prototype.hasOwnProperty.call(source, field)
      ? definitionTextsFromValue(source[field])
      : []
  ))

  if (Object.prototype.hasOwnProperty.call(source, 'definitions')) {
    directDefinitions.push(...definitionTextsFromValue(source.definitions))
  }

  if (Object.prototype.hasOwnProperty.call(source, 'trans')) {
    if (isNestedDefinitionValue(source.trans)) {
      rows.push(...collectDefinitionRows(source.trans, pos))
    } else {
      directDefinitions.push(...definitionTextsFromValue(source.trans))
    }
  }

  const definitions = uniqueTexts(directDefinitions)
  if (definitions.length) {
    rows.push({ pos, definitions })
  }

  return rows
}

function normalizeDefinitionEntries(value, fallbackPos = '') {
  const rows = collectDefinitionRows(value, normalizeDefinitionText(fallbackPos))
  const grouped = []
  const groupIndexes = new Map()

  rows.forEach((row) => {
    const definitions = uniqueTexts(row.definitions)
    if (!definitions.length) return

    const pos = normalizeDefinitionText(row.pos)
    const key = pos || '__without_pos__'
    let group = groupIndexes.get(key)
    if (!group) {
      group = { pos, definitions: [] }
      groupIndexes.set(key, group)
      grouped.push(group)
    }

    definitions.forEach((definition) => {
      if (!group.definitions.includes(definition)) {
        group.definitions.push(definition)
      }
    })
  })

  return grouped.map((entry, index) => ({
    ...entry,
    key: `definition-${index}-${entry.pos || 'text'}`,
  }))
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractExamplePhrase(text = '', word = '') {
  if (!text || !word) return ''
  const match = String(text).match(new RegExp(`\\b(${escapeRegExp(word)})\\b((?:\\s+[A-Za-z'-]+){0,2})`, 'i'))
  if (!match) return ''

  const nextWords = (match[2] || '')
    .trim()
    .split(/\s+/)
    .map((item) => item.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter(Boolean)
  if (!nextWords.length) return ''

  const firstWord = nextWords[0].toLowerCase()
  const blockedFirstWords = new Set(['can', 'could', 'will', 'would', 'should', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'to', 'from', 'of', 'in', 'on', 'at', 'by', 'with', 'and', 'or', 'but'])
  if (blockedFirstWords.has(firstWord)) return ''

  const phraseWords = [match[1], nextWords[0]]
  const bridgeWords = new Set(['my', 'your', 'his', 'her', 'our', 'their', 'the', 'a', 'an', 'this', 'that'])
  if (bridgeWords.has(firstWord) && nextWords[1]) {
    phraseWords.push(nextWords[1])
  }
  return phraseWords.join(' ')
}

function highlightExampleText(text = '', word = '', phrase = '') {
  const escaped = escapeHtml(text)
  if (phrase) {
    const phrasePattern = escapeRegExp(phrase).replace(/\s+/g, '\\s+')
    return escaped.replace(new RegExp(`\\b${phrasePattern}\\b`, 'i'), '<mark class="phrase-highlight">$&</mark>')
  }
  if (!word) return escaped
  return escaped.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi'), '<mark class="word-highlight">$&</mark>')
}

function buildItemBatches(items) {
  if (!items.length) return []
  const chunkSize = Math.ceil(items.length / 3)
  const batches = []
  for (let index = 0; index < items.length; index += chunkSize) {
    batches.push(items.slice(index, index + chunkSize))
  }
  return batches
}

function addUniqueItem(targetRef, item) {
  if (!item || targetRef.value.some((existing) => String(existing.itemId) === String(item.itemId))) return
  targetRef.value = [...targetRef.value, item]
}

function markFailedFeedbackSubmitted(itemId) {
  failedFeedbackItemIds.value = new Set([...failedFeedbackItemIds.value, String(itemId)])
}

function clampIndex(value, max) {
  const index = Number(value)
  if (!Number.isFinite(index) || index < 0) return 0
  return Math.min(Math.floor(index), Math.max(0, max))
}

function getPlanId() {
  return task.value?.plan?.id ?? task.value?.plan?.planId ?? task.value?.planId ?? null
}

function idsFromItems(items) {
  return (items || []).map((item) => String(item?.itemId || '')).filter(Boolean)
}

function createPendingItemMap() {
  return new Map(pendingItems.value.map((item) => [String(item.itemId), item]))
}

function idsFromPendingItems(items, itemMap = createPendingItemMap()) {
  return idsFromItems(items).filter((itemId) => itemMap.has(itemId))
}

function itemsFromIds(ids, itemMap = createPendingItemMap()) {
  const seen = new Set()
  return (ids || []).reduce((items, id) => {
    const key = String(id)
    if (!key || seen.has(key)) return items
    const item = itemMap.get(key)
    if (item) {
      seen.add(key)
      items.push(item)
    }
    return items
  }, [])
}

function firstAvailableBatchIndex(batches, preferredIndex) {
  if (!batches.length) return -1
  const forwardIndex = batches.findIndex((batch, index) => index >= preferredIndex && batch.length > 0)
  if (forwardIndex >= 0) return forwardIndex
  return batches.findIndex((batch) => batch.length > 0)
}

function resolveActiveIndex(items, activeItemId, fallbackIndex) {
  const restoredIndex = items.findIndex((item) => String(item.itemId) === String(activeItemId))
  if (restoredIndex >= 0) return restoredIndex
  return clampIndex(fallbackIndex, items.length - 1)
}

function saveFlowState() {
  if (!auth.user?.id || !task.value?.taskId) return
  if (!pendingItems.value.length) {
    clearFlowState()
    return
  }
  const pendingItemMap = createPendingItemMap()
  const currentItemId = currentItem.value?.itemId == null ? null : String(currentItem.value.itemId)
  writeStudyFlowState(auth.user.id, task.value.taskId, {
    planId: getPlanId() == null ? null : String(getPlanId()),
    flowMode: flowMode.value,
    phase: phase.value,
    segmentIndex: segmentIndex.value,
    activeIndex: activeIndex.value,
    activeItemId: currentItemId && pendingItemMap.has(currentItemId) ? currentItemId : null,
    itemBatchIds: itemBatches.value.map((batch) => idsFromPendingItems(batch, pendingItemMap)),
    retryItemIds: idsFromPendingItems(retryItems.value, pendingItemMap),
    nextRetryItemIds: idsFromPendingItems(nextRetryItems.value, pendingItemMap),
    missedItemIds: idsFromPendingItems(missedItems.value, pendingItemMap),
    failedFeedbackItemIds: [...failedFeedbackItemIds.value].filter((itemId) => pendingItemMap.has(String(itemId))),
  })
}

function clearFlowState() {
  if (!auth.user?.id || !task.value?.taskId) return
  removeStudyFlowState(auth.user.id, task.value.taskId)
}

function restoreLocalFlow() {
  if (!auth.user?.id || !task.value?.taskId) return false
  const cache = readStudyFlowState(auth.user.id, task.value.taskId)
  if (!cache || !pendingItems.value.length) return false

  const pendingItemMap = createPendingItemMap()
  const cachedBatches = Array.isArray(cache.itemBatchIds)
    ? cache.itemBatchIds.map((ids) => itemsFromIds(ids, pendingItemMap))
    : []
  const restoredBatches = cachedBatches.some((batch) => batch.length > 0)
    ? cachedBatches
    : buildItemBatches(pendingItems.value)
  const restoredFlowMode = cache.flowMode === FLOW_RETRY ? FLOW_RETRY : FLOW_SEGMENT
  const restoredPhase = cache.phase === PHASE_CONFIRM ? PHASE_CONFIRM : PHASE_LEARN
  const restoredRetryItems = itemsFromIds(cache.retryItemIds, pendingItemMap)

  itemBatches.value = restoredBatches
  flowMode.value = restoredFlowMode
  phase.value = restoredPhase
  retryItems.value = restoredRetryItems
  nextRetryItems.value = itemsFromIds(cache.nextRetryItemIds, pendingItemMap)
  missedItems.value = itemsFromIds(cache.missedItemIds, pendingItemMap)
  failedFeedbackItemIds.value = new Set(
    (cache.failedFeedbackItemIds || [])
      .map((itemId) => String(itemId))
      .filter((itemId) => pendingItemMap.has(itemId)),
  )

  if (flowMode.value === FLOW_RETRY) {
    if (!retryItems.value.length) return false
    segmentIndex.value = clampIndex(cache.segmentIndex, itemBatches.value.length - 1)
    activeIndex.value = resolveActiveIndex(retryItems.value, cache.activeItemId, cache.activeIndex)
  } else {
    const preferredSegmentIndex = clampIndex(cache.segmentIndex, itemBatches.value.length - 1)
    const availableSegmentIndex = firstAvailableBatchIndex(itemBatches.value, preferredSegmentIndex)
    if (availableSegmentIndex < 0) return false
    segmentIndex.value = availableSegmentIndex
    activeIndex.value = resolveActiveIndex(currentSegmentItems.value, cache.activeItemId, cache.activeIndex)
  }

  saveFlowState()
  return true
}

async function loadTask() {
  if (loading.value || submitting.value) return
  loading.value = true
  try {
    cleanupExpiredStudyFlowStates()
    task.value = await fetchTodayTask()
    needsPlan.value = false
    emptyTitle.value = '暂无待学习卡片'
    emptyDescription.value = '本组完成后可以继续下一组，也可以回到首页查看统计。'
    if (task.value?.status === 'DONE' && !task.value?.clozeAttempted) {
      card.value = null
      clearFlowState()
      const query = task.value.clozeQuizId ? { quizId: task.value.clozeQuizId } : {}
      router.push({ path: '/app/cloze', query })
      return
    }
    if (!restoreLocalFlow()) {
      resetLocalFlow()
    }
    await loadCard()
  } catch (error) {
    task.value = null
    card.value = null
    needsPlan.value = error.code === 30001
    emptyTitle.value = needsPlan.value ? '先创建学习计划' : '暂时无法加载学习卡片'
    emptyDescription.value = needsPlan.value
      ? '选择词库并设置每组新词和复习词后，就可以开始学习。'
      : error.message
  } finally {
    loading.value = false
  }
}

function resetLocalFlow(persist = true) {
  itemBatches.value = buildItemBatches(pendingItems.value)
  segmentIndex.value = 0
  activeIndex.value = 0
  flowMode.value = FLOW_SEGMENT
  phase.value = PHASE_LEARN
  retryItems.value = []
  nextRetryItems.value = []
  missedItems.value = []
  failedFeedbackItemIds.value = new Set()
  if (!pendingItems.value.length) {
    clearFlowState()
  } else if (persist) {
    saveFlowState()
  }
}

async function loadCard() {
  stopPronunciation()
  if (!currentItem.value) {
    card.value = null
    return
  }
  card.value = await fetchTaskItemCard(currentItem.value.itemId)
  aiResult.value = null
  aiQuestion.value = ''
}

function pronunciationUrl(word, type) {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`
}

function stopPronunciation() {
  if (!pronunciationAudio) return
  pronunciationAudio.pause()
  pronunciationAudio.currentTime = 0
  pronunciationLoadingType.value = ''
}

async function playPronunciation(type) {
  const word = card.value?.word?.trim()
  if (!word || pronunciationLoadingType.value) return
  pronunciationLoadingType.value = type
  try {
    stopPronunciation()
    pronunciationLoadingType.value = type
    pronunciationAudio = new Audio(pronunciationUrl(word, type))
    pronunciationAudio.addEventListener('ended', () => {
      pronunciationLoadingType.value = ''
    }, { once: true })
    pronunciationAudio.addEventListener('error', () => {
      pronunciationLoadingType.value = ''
      ElMessage.warning('发音暂时不可用')
    }, { once: true })
    await pronunciationAudio.play()
  } catch {
    pronunciationLoadingType.value = ''
    ElMessage.warning('发音暂时不可用')
  }
}

async function goNextLearnCard() {
  if (!card.value || submitting.value || generatingCloze.value) return
  if (flowMode.value === FLOW_RETRY) {
    phase.value = PHASE_CONFIRM
    saveFlowState()
    return
  }
  if (activeIndex.value < activeItems.value.length - 1) {
    activeIndex.value += 1
    saveFlowState()
    await loadCard()
    return
  }
  activeIndex.value = 0
  phase.value = PHASE_CONFIRM
  saveFlowState()
  await loadCard()
}

async function forgetCurrentCard() {
  if (!currentItem.value || submitting.value || generatingCloze.value) return
  const item = currentItem.value
  await submitUnknownOnce(item)
  if (flowMode.value === FLOW_RETRY) {
    addUniqueItem(nextRetryItems, item)
  } else {
    addUniqueItem(missedItems, item)
  }
  saveFlowState()
  await advanceAfterConfirm()
}

async function submitUnknownOnce(item) {
  const itemId = String(item.itemId)
  if (failedFeedbackItemIds.value.has(itemId)) return
  submitting.value = true
  try {
    await submitTaskFeedback(item.itemId, { feedback: 'UNKNOWN', durationSeconds: 0 })
    markFailedFeedbackSubmitted(itemId)
    saveFlowState()
  } finally {
    submitting.value = false
  }
}

async function rememberCurrentCard() {
  if (!card.value || submitting.value || generatingCloze.value) return
  submitting.value = true
  try {
    const response = await submitTaskFeedback(card.value.itemId, { feedback: 'KNOWN', durationSeconds: 0 })
    applyFeedbackProgress(response)
    saveFlowState()
    if (response.dailyTaskDone && task.value?.taskId) {
      clearFlowState()
      await generateCompletedGroupCloze(task.value.taskId)
      return
    }
    await advanceAfterConfirm()
  } finally {
    submitting.value = false
  }
}

async function advanceAfterConfirm() {
  if (activeIndex.value < activeItems.value.length - 1) {
    activeIndex.value += 1
    if (flowMode.value === FLOW_RETRY) {
      phase.value = PHASE_LEARN
    }
    saveFlowState()
    await loadCard()
    return
  }

  if (flowMode.value === FLOW_RETRY) {
    await finishRetryRound()
  } else {
    await finishSegmentRound()
  }
}

async function finishSegmentRound() {
  if (segmentIndex.value < itemBatches.value.length - 1) {
    segmentIndex.value += 1
    activeIndex.value = 0
    phase.value = PHASE_LEARN
    saveFlowState()
    await loadCard()
    return
  }
  if (missedItems.value.length > 0) {
    const items = [...missedItems.value]
    missedItems.value = []
    await startRetryRound(items)
    return
  }
  await loadTask()
}

async function startRetryRound(items) {
  flowMode.value = FLOW_RETRY
  retryItems.value = [...items]
  nextRetryItems.value = []
  activeIndex.value = 0
  phase.value = PHASE_LEARN
  saveFlowState()
  await loadCard()
}

async function finishRetryRound() {
  if (nextRetryItems.value.length > 0) {
    await startRetryRound(nextRetryItems.value)
    return
  }
  await loadTask()
}

function applyFeedbackProgress(response) {
  if (!task.value || !response?.taskProgress) return
  const item = task.value.items?.find((taskItem) => String(taskItem.itemId) === String(response.itemId))
  if (item) {
    item.status = response.status
    item.feedback = response.feedback
  }
  task.value.doneCount = response.taskProgress.doneCount
  task.value.completionRate = response.taskProgress.completionRate
  task.value.progress = response.taskProgress
  if (response.dailyTaskDone) {
    task.value.status = 'DONE'
  }
}

async function generateCompletedGroupCloze(taskId) {
  if (generatingCloze.value) return
  clearFlowState()
  card.value = null
  generatingCloze.value = true
  try {
    const task = await createClozeTask(
      { dailyTaskId: taskId, sourceType: 'COMPLETED_GROUP', targetWordCount: 10 },
      { silentError: true },
    )
    if (task.resultId) {
      router.push({ path: '/app/cloze', query: { quizId: task.resultId, auto: '1' } })
    } else {
      await loadTask()
    }
  } catch (error) {
    await loadTask()
    const message = error.code === 40001
      ? '今日学习已完成，但 AI 配置不可用。可以先去 AI 配置页检查。'
      : '今日学习已完成，但完形填空暂时生成失败。可以稍后在完形填空页重试。'
    ElMessage.warning(message)
    router.push({ path: '/app/cloze', query: { generateError: error.code === 40001 ? 'config' : 'ai' } })
  } finally {
    generatingCloze.value = false
  }
}

async function toggleFavorite() {
  if (!card.value?.wordbookId || !card.value?.wordId || favoriteOperating.value) return
  favoriteOperating.value = true
  try {
    if (card.value.favorite) {
      if (card.value.favoriteWordId) {
        await deleteFavoriteWord(card.value.favoriteWordId)
      }
      card.value.favorite = false
      card.value.favoriteWordId = null
    } else {
      const favorite = await favoriteWord({ wordbookId: card.value.wordbookId, wordId: card.value.wordId })
      card.value.favorite = true
      card.value.favoriteWordId = favorite.favoriteWordId
    }
  } finally {
    favoriteOperating.value = false
  }
}

function openAiQuestion() {
  aiDialogVisible.value = true
}

async function askAi(regenerate = false) {
  if (!card.value?.wordId || !card.value?.wordbookId || aiLoading.value || aiRegenerating.value) return
  const question = aiQuestion.value.trim()
  if (!question) {
    ElMessage.warning('请输入你想问的问题')
    return
  }
  aiLoading.value = !regenerate
  aiRegenerating.value = regenerate
  try {
    aiResult.value = await askWordQuestion(
      card.value.wordId,
      {
        wordbookId: card.value.wordbookId,
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
    aiLoading.value = false
    aiRegenerating.value = false
  }
}

function useFollowUp(question) {
  aiQuestion.value = question
  askAi(false)
}

onMounted(loadTask)
onBeforeUnmount(stopPronunciation)
</script>

<template>
  <section class="study-page">
    <PageHeader title="单词学习" :subtitle="pageSubtitle" />

    <el-skeleton v-if="loading" :rows="6" animated />
    <el-card v-else-if="!card && generatingCloze" class="panel-card narrow" shadow="never">
      <StarterPanel
        title="本组学习已完成"
        description="正在生成必做完形填空，稍等片刻就会进入练习。"
        :icon="Refresh"
      />
    </el-card>

    <el-card v-else-if="!card" class="panel-card narrow" shadow="never">
      <StarterPanel
        :title="emptyTitle"
        :description="emptyDescription"
        :icon="needsPlan ? Calendar : Refresh"
        :error="!needsPlan"
      >
        <el-button v-if="needsPlan" type="primary" @click="router.push('/app/plans')">创建计划</el-button>
        <el-button v-if="needsPlan" @click="router.push('/app/wordbooks')">选择词库</el-button>
        <el-button v-else type="primary" @click="loadTask">重试</el-button>
      </StarterPanel>
    </el-card>

    <div v-else class="study-card-layout">
      <el-card class="study-word-card" shadow="never">
        <div class="word-kind-row">
          <div class="word-card-meta">
            <el-tag>{{ card.itemType }}</el-tag>
            <el-tag type="success" v-if="card.favorite">已收藏</el-tag>
            <span v-if="card.masteryStatus && card.masteryStatus !== card.itemType">{{ card.masteryStatus }}</span>
          </div>
          <div class="word-card-actions">
            <el-button class="ai-toolbar-button" circle title="AI 问答" aria-label="AI 问答" @click="openAiQuestion">
              <svg class="ai-toolbar-svg" viewBox="0 0 24 24" aria-hidden="true">
                <path class="ai-bubble" d="M5.2 6.4c1.4-2 4.4-3 7.2-2.6 3.4.4 6 2.5 6.3 5.3.4 3.3-2.5 6.1-6.3 6.5-1 .1-1.9.1-2.8-.1L5 18.1l1.2-4.2c-1.7-1.6-2.2-4.8-1-7.5Z" />
                <path class="ai-spark" d="M18.2 3.8l.4 1.4 1.3.4-1.3.5-.4 1.3-.5-1.3-1.3-.5 1.3-.4.5-1.4Z" />
                <path class="ai-letter" d="M8 13.1 9.7 7l1.8 6.1M8.6 11h2.3M14.3 7.2v5.9M13.4 7.2h1.8M13.4 13.1h1.8" />
              </svg>
            </el-button>
            <el-button
              circle
              :type="card.favorite ? 'warning' : 'default'"
              :loading="favoriteOperating"
              :disabled="favoriteOperating"
              :title="card.favorite ? '取消收藏' : '收藏单词'"
              @click="toggleFavorite"
            >
              <LexiIcon :name="card.favorite ? 'star-filled' : 'star'" />
            </el-button>
          </div>
        </div>

        <div class="study-card-scroll">
          <div class="study-flow-meta">
            <el-tag v-if="isLegacyPendingTask" type="warning" effect="plain">继续未完成学习组</el-tag>
            <el-tag effect="plain">{{ flowTitle }}</el-tag>
            <el-tag :type="recallMode ? 'warning' : 'success'" effect="plain">{{ phaseTitle }}</el-tag>
            <span>{{ cardPositionLabel }}</span>
          </div>

          <div class="study-word-title">
            <h1>{{ card.word }}</h1>
          </div>
          <div v-if="card.phonetic0 || card.phonetic1" class="phonetic">
            <span v-if="card.phonetic0" class="phonetic-item">
              英 {{ card.phonetic0 }}
              <el-button
                circle
                text
                class="phonetic-audio-button"
                :class="{ 'is-playing': pronunciationLoadingType === '1' }"
                :disabled="(Boolean(pronunciationLoadingType) && pronunciationLoadingType !== '1') || !card.word"
                title="播放英式发音"
                aria-label="播放英式发音"
                @click="playPronunciation('1')"
              >
                <svg class="volume-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path class="volume-wave" fill="currentColor" d="M16 21c3.527-1.547 5.999-4.909 5.999-9S19.527 4.547 16 3v2c2.387 1.386 3.999 4.047 3.999 7S18.387 17.614 16 19z"></path>
                  <path class="volume-core" fill="currentColor" d="M16 7v10c1.225-1.1 2-3.229 2-5s-.775-3.9-2-5M4 17h2.697l5.748 3.832a1 1 0 0 0 1.027.05A1 1 0 0 0 14 20V4a1 1 0 0 0-1.554-.832L6.697 7H4c-1.103 0-2 .897-2 2v6c0 1.103.897 2 2 2m0-8h3c.033 0 .061-.016.093-.019a1 1 0 0 0 .38-.116c.026-.015.057-.017.082-.033L12 5.868v12.264l-4.445-2.964c-.025-.017-.056-.02-.082-.033a1 1 0 0 0-.382-.116C7.059 15.016 7.032 15 7 15H4z"></path>
                </svg>
              </el-button>
            </span>
            <span v-if="card.phonetic1" class="phonetic-item">
              美 {{ card.phonetic1 }}
              <el-button
                circle
                text
                class="phonetic-audio-button"
                :class="{ 'is-playing': pronunciationLoadingType === '2' }"
                :disabled="(Boolean(pronunciationLoadingType) && pronunciationLoadingType !== '2') || !card.word"
                title="播放美式发音"
                aria-label="播放美式发音"
                @click="playPronunciation('2')"
              >
                <svg class="volume-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path class="volume-wave" fill="currentColor" d="M16 21c3.527-1.547 5.999-4.909 5.999-9S19.527 4.547 16 3v2c2.387 1.386 3.999 4.047 3.999 7S18.387 17.614 16 19z"></path>
                  <path class="volume-core" fill="currentColor" d="M16 7v10c1.225-1.1 2-3.229 2-5s-.775-3.9-2-5M4 17h2.697l5.748 3.832a1 1 0 0 0 1.027.05A1 1 0 0 0 14 20V4a1 1 0 0 0-1.554-.832L6.697 7H4c-1.103 0-2 .897-2 2v6c0 1.103.897 2 2 2m0-8h3c.033 0 .061-.016.093-.019a1 1 0 0 0 .38-.116c.026-.015.057-.017.082-.033L12 5.868v12.264l-4.445-2.964c-.025-.017-.056-.02-.082-.033a1 1 0 0 0-.382-.116C7.059 15.016 7.032 15 7 15H4z"></path>
                </svg>
              </el-button>
            </span>
          </div>

          <p class="study-flow-hint">{{ flowHint }}</p>

          <template v-if="learningMode">
            <div v-if="cardDefinitions.length" class="definition-block revealed">
              <div
                v-for="definition in cardDefinitions"
                :key="definition.key"
                class="definition-line"
                :class="{ 'without-pos': !definition.pos }"
              >
                <span v-if="definition.pos" class="definition-pos">{{ definition.pos }}</span>
                <div class="definition-text-list">
                  <template v-for="(text, index) in definition.definitions" :key="`${definition.key}-${text}`">
                    <span class="definition-text">{{ text }}</span>
                    <span v-if="index < definition.definitions.length - 1" class="definition-separator">/</span>
                  </template>
                </div>
              </div>
            </div>
            <div v-if="cardSentences.length" class="example-list">
              <div v-for="sentence in cardSentences" :key="sentence.key" class="example-block">
                <p v-html="sentence.highlightedEnglish"></p>
                <span>{{ sentence.cn }}</span>
                <div v-if="sentence.phrase" class="example-phrase">
                  <span>搭配</span>
                  <strong>{{ sentence.phrase }}</strong>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <div v-if="cardSentences.length" class="example-list recall-example-list">
              <div v-for="sentence in cardSentences" :key="`recall-${sentence.key}`" class="example-block recall-example">
                <p v-html="sentence.highlightedEnglish"></p>
              </div>
            </div>
          </template>
        </div>

        <div v-if="learningMode" class="feedback-row">
          <el-button size="large" type="primary" :loading="submitting || generatingCloze" :disabled="submitting || generatingCloze" @click="goNextLearnCard">
            {{ learnActionLabel }}
          </el-button>
        </div>
        <div v-else class="feedback-row">
          <el-button size="large" type="primary" :loading="submitting || generatingCloze" @click="rememberCurrentCard">
            {{ generatingCloze ? '正在生成完形填空' : '认识' }}
          </el-button>
          <el-button size="large" :loading="submitting" :disabled="submitting || generatingCloze" @click="forgetCurrentCard">不认识</el-button>
        </div>
      </el-card>

      <el-card class="panel-card progress-side" shadow="never">
        <div class="study-total-progress">
          <span>总进度 {{ completedItemCount }}/{{ totalItemCount }}</span>
          <strong>{{ studyCompletionRate }}%</strong>
        </div>
        <el-progress :percentage="studyCompletionRate" :show-text="false" />
      </el-card>
    </div>

    <el-dialog v-model="aiDialogVisible" title="AI 单词问答" width="680px">
      <div class="ai-question-box">
        <div class="ai-question-word">
          <el-tag>{{ card?.word }}</el-tag>
          <span v-if="learningMode && card?.primaryDefinition">{{ card.primaryDefinition }}</span>
        </div>
        <el-input
          v-model.trim="aiQuestion"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          :placeholder="aiQuestionPlaceholder"
        />
        <div class="button-row">
          <el-button :icon="Cpu" @click="router.push('/app/ai-config')">AI 配置</el-button>
          <el-button type="primary" :icon="ChatLineRound" :loading="aiLoading" :disabled="aiLoading || aiRegenerating" @click="askAi(false)">提问</el-button>
        </div>
      </div>

      <el-skeleton v-if="aiLoading" :rows="5" animated />
      <template v-else-if="aiResult?.content">
        <div class="ai-content-panel">
          <div class="card-header-row">
            <el-tag :type="aiResult.cacheHit ? 'success' : 'info'">{{ aiResult.cacheHit ? '缓存命中' : '新生成' }}</el-tag>
            <el-button size="small" :icon="Refresh" :loading="aiRegenerating" :disabled="aiLoading || aiRegenerating" @click="askAi(true)">重新回答</el-button>
          </div>

          <p class="ai-brief">{{ aiResult.content.answer }}</p>
          <div v-if="aiResult.content.keyPoints?.length" class="ai-section">
            <h3>要点</h3>
            <ul><li v-for="item in aiResult.content.keyPoints" :key="item">{{ item }}</li></ul>
          </div>
          <div v-if="aiResult.content.relatedWords?.length" class="ai-section">
            <h3>相关词</h3>
            <div class="ai-tag-row">
              <el-tag v-for="item in aiResult.content.relatedWords" :key="item" effect="plain">{{ item }}</el-tag>
            </div>
          </div>
          <div v-if="aiResult.content.followUps?.length" class="ai-section">
            <h3>继续追问</h3>
            <div class="ai-follow-row">
              <el-button v-for="item in aiResult.content.followUps" :key="item" size="small" plain @click="useFollowUp(item)">
                {{ item }}
              </el-button>
            </div>
          </div>
        </div>
      </template>
      <EmptyState v-else title="还没有提问" description="输入你对这个单词的疑问，例如反义词、语境差异或易混点。">
        <el-button :icon="Cpu" @click="router.push('/app/ai-config')">AI 配置</el-button>
      </EmptyState>
    </el-dialog>
  </section>
</template>
