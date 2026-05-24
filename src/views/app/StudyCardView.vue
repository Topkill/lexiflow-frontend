<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, ChatLineRound, Cpu, Refresh } from '@element-plus/icons-vue'
import MarkdownIt from 'markdown-it'
import LexiIcon from '../../components/LexiIcon.vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import StarterPanel from '../../components/StarterPanel.vue'
import { createClozeTask, streamWordQuestion } from '../../api/ai'
import { deleteFavoriteWord, favoriteWord } from '../../api/review'
import { createWrongWordPractice, fetchStudyTask, fetchTaskItemCard, fetchTodayTask, submitTaskFeedback } from '../../api/study'
import { lookupWordInWordbook } from '../../api/wordbook'
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
const CHOICE_IDLE = 'idle'
const CHOICE_CHOOSING = 'choosing'
const CHOICE_RESULT = 'result'
const AI_DIALOG_BODY_CLASS = 'study-ai-dialog-open'
const ITEM_TYPE_NEW = 'NEW'
const ITEM_TYPE_REVIEW = 'REVIEW'
const ITEM_TYPE_EXTRA = 'EXTRA'
const ITEM_TYPE_FLOW_ORDER = [ITEM_TYPE_NEW, ITEM_TYPE_REVIEW, ITEM_TYPE_EXTRA]
const SEGMENT_SPLIT_THRESHOLD = 10
const AI_QUOTA_EXHAUSTED_MESSAGE = '今日公共 AI 调用次数已用完'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const generatingCloze = ref(false)
const favoriteOperating = ref(false)
const cardLoading = ref(false)
const task = ref(null)
const flowGroups = ref([])
const flowGroupIndex = ref(0)
const segmentIndex = ref(0)
const activeIndex = ref(0)
const flowMode = ref(FLOW_SEGMENT)
const phase = ref(PHASE_LEARN)
const retryItems = ref([])
const retryBatches = ref([])
const nextRetryItems = ref([])
const missedItems = ref([])
const failedFeedbackItemIds = ref(new Set())
const choiceState = ref(CHOICE_IDLE)
const choiceItemId = ref(null)
const selectedOptionWordId = ref(null)
const choiceFeedback = ref('')
const choiceSubmitted = ref(false)
const choiceDailyTaskDone = ref(false)
const card = ref(null)
const emptyTitle = ref('暂无待学习卡片')
const emptyDescription = ref('本组完成后可以继续下一组，也可以回到首页查看统计。')
const needsPlan = ref(false)
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const aiRegenerating = ref(false)
const aiStreaming = ref(false)
const aiResult = ref(null)
const aiQuestion = ref('')
const aiQuestionInputRef = ref(null)
const aiMarkdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})
const lookupVisible = ref(false)
const lookupWord = ref('')
const lookupLoading = ref(false)
const lookupResult = ref(null)
const lookupError = ref('')
const lookupSelectionVisible = ref(false)
const lookupSelectionText = ref('')
const lookupSelectionStyle = ref({ top: '0px', left: '0px' })
const studyCardScrollRef = ref(null)
const pronunciationLoadingType = ref('')
let pronunciationAudio = null
let lookupSelectionRaf = null
let aiAbortController = null

const queryTaskId = computed(() => route.query.taskId || '')
const queryMode = computed(() => route.query.mode || '')
const isWrongPracticeTask = computed(() => task.value?.taskType === 'WRONG_WORD_PRACTICE' || queryMode.value === 'wrong-practice')
const completedWrongPractice = computed(() => isWrongPracticeTask.value && task.value?.status === 'DONE')

function toggleAiDialogBodyClass(open) {
  document.body.classList.toggle(AI_DIALOG_BODY_CLASS, open)
}

const pendingItems = computed(() => task.value?.items?.filter((item) => item.status === 'PENDING') || [])
const currentFlowGroup = computed(() => flowGroups.value[flowGroupIndex.value] || null)
const itemBatches = computed(() => currentFlowGroup.value?.batches || [])
const currentSegmentItems = computed(() => itemBatches.value[segmentIndex.value] || [])
const activeItems = computed(() => (flowMode.value === FLOW_RETRY ? retryItems.value : currentSegmentItems.value))
const currentItem = computed(() => activeItems.value[activeIndex.value])
const segmentCount = computed(() => (flowMode.value === FLOW_RETRY ? retryBatches.value.length : itemBatches.value.length))
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
const pageTitle = computed(() => (isWrongPracticeTask.value ? '错词专项复习' : '单词学习'))
const pageSubtitle = computed(() => {
  const groupLabel = `第 ${task.value?.groupNo || 1} 组`
  if (isWrongPracticeTask.value) {
    return `${groupLabel}：只练错词，不影响今日学习进度`
  }
  if (isLegacyPendingTask.value) {
    return `${groupLabel}：继续未完成学习组，完成后再进入必做完形填空`
  }
  return `${groupLabel}：分段学习、轻量回忆，再进入必做完形填空`
})
const flowTitle = computed(() => `第 ${segmentIndex.value + 1}/${segmentCount.value || 1} 段`)
const phaseTitle = computed(() => (learningMode.value ? '学习' : '回忆'))
const cardPositionLabel = computed(() => `${Math.min(activeIndex.value + 1, activeItems.value.length || 1)}/${activeItems.value.length || 0}`)
const currentItemTypeKey = computed(() => normalizeItemTypeKey(currentFlowGroup.value?.key || currentItem.value?.itemType || card.value?.itemType))
const currentItemTypeLabel = computed(() => {
  if (currentItemTypeKey.value === ITEM_TYPE_REVIEW) return '复习'
  if (currentItemTypeKey.value === ITEM_TYPE_EXTRA) return '错词'
  return '新词'
})
const studyStageLabel = computed(() => {
  const label = currentItemTypeLabel.value
  if (flowMode.value !== FLOW_RETRY) return currentItemTypeKey.value === ITEM_TYPE_EXTRA ? '错词重练' : label
  return label.endsWith('重练') ? label : `${label}重练`
})
const learnActionLabel = computed(() => {
  return activeIndex.value >= activeItems.value.length - 1 ? '开始回忆' : '下一个'
})
const flowHint = computed(() => {
  if (generatingCloze.value) return '本组单词学习已完成，正在生成必做完形填空。'
  if (!learningMode.value && choiceState.value === CHOICE_CHOOSING) return '选择你想起的中文释义，答完后再进入下一个词。'
  if (!learningMode.value && choiceState.value === CHOICE_RESULT) return isChoiceCorrect.value ? '验证通过，点下一个继续。' : '正确答案已标出，后面会进入重练。'
  if (flowMode.value === FLOW_RETRY) {
    return learningMode.value
      ? '这些是刚才没记住的词，先看完整信息，再重新回忆。'
      : '现在重新回忆这些词，确认是否已经想起中文意思。'
  }
  return learningMode.value ? '先快速理解本段单词，随后会折叠中文释义做轻量回忆。' : '现在只看英文信息，确认自己能不能想起中文意思。'
})
const aiQuestionPlaceholder = computed(() => card.value?.word ? `例如：${card.value.word} 的反义词有哪些？` : '例如：这个词的反义词有哪些？')
const aiAnswerHtml = computed(() => {
  const answer = normalizeAiMarkdownText(aiResult.value?.content?.answer)
  return answer ? aiMarkdown.render(answer) : ''
})
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
const lookupDefinitions = computed(() => {
  if (!lookupResult.value) return []
  const fromTrans = normalizeDefinitionEntries(lookupResult.value.trans, lookupResult.value.primaryPos)
  if (fromTrans.length) return fromTrans
  const fallback = normalizeLookupText(lookupResult.value.primaryDefinition)
  return fallback
    ? [{ key: 'primary-definition', pos: normalizeLookupText(lookupResult.value.primaryPos), definitions: [fallback] }]
    : []
})
const lookupSentences = computed(() => normalizeLookupSentences(lookupResult.value?.sentences).slice(0, 2))
const choiceQuestion = computed(() => card.value?.choiceQuestion || null)
const choiceOptions = computed(() => (
  Array.isArray(choiceQuestion.value?.options) ? choiceQuestion.value.options : []
))
const correctChoiceOption = computed(() => {
  const rawIndex = choiceQuestion.value?.correctIndex
  if (rawIndex == null || String(rawIndex).trim() === '') return null
  const index = Number(rawIndex)
  return Number.isInteger(index) && index >= 0 && index < choiceOptions.value.length
    ? choiceOptions.value[index]
    : null
})
const hasChoiceQuestion = computed(() => choiceOptions.value.length === 4 && Boolean(correctChoiceOption.value))
const isChoiceChoosing = computed(() => choiceState.value === CHOICE_CHOOSING)
const isChoiceResult = computed(() => choiceState.value === CHOICE_RESULT)
const isChoiceActive = computed(() => isChoiceChoosing.value || isChoiceResult.value)
const isChoiceCorrect = computed(() => choiceFeedback.value === 'KNOWN')
const choiceResultText = computed(() => (isChoiceCorrect.value ? '答对了' : '答错了，已加入重练'))

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

function normalizeLookupText(value) {
  if (value == null || typeof value === 'boolean') return ''
  return String(value).replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()
}

function normalizeAiMarkdownText(value) {
  if (value == null || typeof value === 'boolean') return ''
  return String(value)
    .trim()
    .replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
}

function renderAiInlineMarkdown(value) {
  const text = normalizeAiMarkdownText(value)
  return text ? aiMarkdown.renderInline(text) : ''
}

function normalizeLookupSentences(value) {
  const parsed = parseJsonLike(value)
  if (!parsed.valid || !Array.isArray(parsed.value)) return []
  return parsed.value.map((sentence, index) => {
    if (typeof sentence === 'string') {
      const english = normalizeLookupText(sentence)
      return english ? { key: `sentence-${index}`, english, chinese: '' } : null
    }
    if (!sentence || typeof sentence !== 'object') return null
    const english = normalizeLookupText(sentence.c || sentence.en || sentence.english || sentence.sentence)
    const chinese = normalizeLookupText(sentence.cn || sentence.zh || sentence.chinese || sentence.translation)
    return english ? { key: `sentence-${index}-${english}`, english, chinese } : null
  }).filter(Boolean)
}

function elementFromSelectionNode(node) {
  if (!node) return null
  return node.nodeType === 3 ? node.parentElement : node
}

function isStudyLookupAllowedElement(element) {
  const root = studyCardScrollRef.value
  if (!root || !element || !root.contains(element)) return false
  if (element.closest('button, .el-button, .phonetic, .choice-question-panel')) return false

  const allowedArea = element.closest('.study-word-title, .definition-block, .example-list')
  if (!allowedArea || !root.contains(allowedArea)) return false
  if (recallMode.value && allowedArea.closest('.study-word-title')) return false
  return true
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

function hideLookupSelection() {
  lookupSelectionVisible.value = false
  lookupSelectionText.value = ''
}

function updateLookupSelection() {
  const selection = window.getSelection?.()
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    hideLookupSelection()
    return
  }

  const range = selection.getRangeAt(0)
  const startElement = elementFromSelectionNode(range.startContainer)
  const endElement = elementFromSelectionNode(range.endContainer)
  if (!isStudyLookupAllowedElement(startElement) || !isStudyLookupAllowedElement(endElement)) {
    hideLookupSelection()
    return
  }

  const text = normalizeLookupText(selection.toString())
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

function scheduleLookupSelectionUpdate() {
  if (lookupSelectionRaf) {
    window.cancelAnimationFrame(lookupSelectionRaf)
  }
  lookupSelectionRaf = window.requestAnimationFrame(() => {
    lookupSelectionRaf = null
    updateLookupSelection()
  })
}

function handleStudySelectionChange() {
  scheduleLookupSelectionUpdate()
}

function handleLookupSelectionLookup() {
  if (!lookupSelectionText.value) return
  lookupByRawWord(lookupSelectionText.value)
}

async function lookupByRawWord(rawWord) {
  const word = normalizeLookupText(rawWord)
  if (!word) return
  if (!card.value?.wordbookId) {
    ElMessage.warning('当前卡片缺少词库信息，暂时无法查词')
    return
  }
  hideLookupSelection()
  lookupVisible.value = true
  lookupWord.value = word
  lookupResult.value = null
  lookupError.value = ''
  lookupLoading.value = true
  try {
    lookupResult.value = await lookupWordInWordbook(card.value.wordbookId, word)
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

function buildItemBatches(items) {
  if (!items.length) return []
  if (items.length <= SEGMENT_SPLIT_THRESHOLD) return [items]
  const chunkSize = Math.ceil(items.length / 3)
  const batches = []
  for (let index = 0; index < items.length; index += chunkSize) {
    batches.push(items.slice(index, index + chunkSize))
  }
  return batches
}

function normalizeItemTypeKey(value) {
  const type = String(value || ITEM_TYPE_NEW).trim().toUpperCase()
  return type || ITEM_TYPE_NEW
}

function buildStudyFlowGroups(items) {
  if (!items.length) return []
  const groupedItems = new Map()
  const customOrder = []

  items.forEach((item) => {
    const key = normalizeItemTypeKey(item.itemType)
    if (!groupedItems.has(key)) {
      groupedItems.set(key, [])
      if (!ITEM_TYPE_FLOW_ORDER.includes(key)) {
        customOrder.push(key)
      }
    }
    groupedItems.get(key).push(item)
  })

  const orderedKeys = [
    ...ITEM_TYPE_FLOW_ORDER.filter((key) => groupedItems.has(key)),
    ...customOrder,
  ]
  return orderedKeys
    .map((key) => ({
      key,
      batches: buildItemBatches(groupedItems.get(key) || []),
    }))
    .filter((group) => group.batches.some((batch) => batch.length > 0))
}

function addUniqueItem(targetRef, item) {
  if (!item || targetRef.value.some((existing) => String(existing.itemId) === String(item.itemId))) return
  targetRef.value = [...targetRef.value, item]
}

function markFailedFeedbackSubmitted(itemId) {
  failedFeedbackItemIds.value = new Set([...failedFeedbackItemIds.value, String(itemId)])
}

function resetChoiceState() {
  choiceState.value = CHOICE_IDLE
  choiceItemId.value = null
  selectedOptionWordId.value = null
  choiceFeedback.value = ''
  choiceSubmitted.value = false
  choiceDailyTaskDone.value = false
}

function currentItemIdString() {
  return currentItem.value?.itemId == null ? null : String(currentItem.value.itemId)
}

function normalizeChoiceStateValue(value) {
  return [CHOICE_CHOOSING, CHOICE_RESULT].includes(value) ? value : CHOICE_IDLE
}

function normalizeChoiceFeedbackValue(value) {
  const feedback = String(value || '').trim().toUpperCase()
  return ['KNOWN', 'UNKNOWN'].includes(feedback) ? feedback : ''
}

function isChoiceOptionCorrect(option) {
  return option?.wordId != null && String(option.wordId) === String(correctChoiceOption.value?.wordId)
}

function choiceOptionClass(option) {
  if (!isChoiceResult.value) return ''
  if (isChoiceOptionCorrect(option)) return 'is-correct'
  if (selectedOptionWordId.value != null && String(option.wordId) === String(selectedOptionWordId.value)) {
    return 'is-wrong'
  }
  return 'is-muted'
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

function flowGroupBatchIdsFromPendingItems(itemMap = createPendingItemMap()) {
  return flowGroups.value
    .map((group) => ({
      key: group.key,
      itemBatchIds: group.batches.map((batch) => idsFromPendingItems(batch, itemMap)),
    }))
    .filter((group) => group.itemBatchIds.some((ids) => ids.length > 0))
}

function retryBatchIdsFromPendingItems(itemMap = createPendingItemMap()) {
  return retryBatches.value.map((batch) => idsFromPendingItems(batch, itemMap)).filter((ids) => ids.length > 0)
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

function flowGroupsFromCachedBatchIds(cacheGroups, itemMap = createPendingItemMap()) {
  if (!Array.isArray(cacheGroups)) return []
  return cacheGroups
    .map((group) => {
      const batches = Array.isArray(group?.itemBatchIds)
        ? group.itemBatchIds.map((ids) => itemsFromIds(ids, itemMap)).filter((batch) => batch.length > 0)
        : []
      return {
        key: normalizeItemTypeKey(group?.key),
        batches,
      }
    })
    .filter((group) => group.batches.length > 0)
}

function batchesFromCachedIds(batchIds, itemMap = createPendingItemMap()) {
  if (!Array.isArray(batchIds)) return []
  return batchIds
    .map((ids) => itemsFromIds(ids, itemMap))
    .filter((batch) => batch.length > 0)
}

function firstAvailableFlowGroupIndex(groups, preferredIndex) {
  if (!groups.length) return -1
  const normalizedIndex = clampIndex(preferredIndex, groups.length - 1)
  const forwardIndex = groups.findIndex((group, index) => index >= normalizedIndex && group.batches.some((batch) => batch.length > 0))
  if (forwardIndex >= 0) return forwardIndex
  return groups.findIndex((group) => group.batches.some((batch) => batch.length > 0))
}

function resolveFlowGroupIndex(groups, cache) {
  if (!groups.length) return -1
  const cachedKey = cache?.flowGroupKey ? normalizeItemTypeKey(cache.flowGroupKey) : ''
  const keyIndex = cachedKey ? groups.findIndex((group) => group.key === cachedKey) : -1
  if (keyIndex >= 0) return keyIndex
  return firstAvailableFlowGroupIndex(groups, cache?.flowGroupIndex ?? 0)
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
  const persistChoiceItemId = currentItemId
    && phase.value === PHASE_CONFIRM
    && choiceState.value !== CHOICE_IDLE
    && String(choiceItemId.value) === currentItemId
    && pendingItemMap.has(currentItemId)
    ? currentItemId
    : null
  writeStudyFlowState(auth.user.id, task.value.taskId, {
    planId: getPlanId() == null ? null : String(getPlanId()),
    flowMode: flowMode.value,
    phase: phase.value,
    flowGroupIndex: flowGroupIndex.value,
    flowGroupKey: currentFlowGroup.value?.key || null,
    segmentIndex: segmentIndex.value,
    activeIndex: activeIndex.value,
    activeItemId: currentItemId && pendingItemMap.has(currentItemId) ? currentItemId : null,
    flowGroupBatchIds: flowGroupBatchIdsFromPendingItems(pendingItemMap),
    retryItemIds: idsFromPendingItems(retryItems.value, pendingItemMap),
    retryBatchIds: retryBatchIdsFromPendingItems(pendingItemMap),
    nextRetryItemIds: idsFromPendingItems(nextRetryItems.value, pendingItemMap),
    missedItemIds: idsFromPendingItems(missedItems.value, pendingItemMap),
    failedFeedbackItemIds: [...failedFeedbackItemIds.value].filter((itemId) => pendingItemMap.has(String(itemId))),
    choiceState: persistChoiceItemId ? choiceState.value : CHOICE_IDLE,
    choiceItemId: persistChoiceItemId,
    selectedOptionWordId: persistChoiceItemId ? selectedOptionWordId.value : null,
    choiceFeedback: persistChoiceItemId ? choiceFeedback.value : '',
    choiceSubmitted: persistChoiceItemId ? choiceSubmitted.value : false,
  })
}

function clearFlowState() {
  if (!auth.user?.id || !task.value?.taskId) return
  removeStudyFlowState(auth.user.id, task.value.taskId)
}

function restoreChoiceState(cache) {
  resetChoiceState()
  const activeItemId = currentItemIdString()
  if (!activeItemId || phase.value !== PHASE_CONFIRM || String(cache.choiceItemId || '') !== activeItemId) return

  const restoredChoiceState = normalizeChoiceStateValue(cache.choiceState)
  if (restoredChoiceState === CHOICE_IDLE) return

  const restoredFeedback = normalizeChoiceFeedbackValue(cache.choiceFeedback)
  if (restoredChoiceState === CHOICE_RESULT && (!cache.choiceSubmitted || !restoredFeedback)) return

  choiceState.value = restoredChoiceState
  choiceItemId.value = activeItemId
  selectedOptionWordId.value = cache.selectedOptionWordId == null ? null : String(cache.selectedOptionWordId)
  choiceFeedback.value = restoredFeedback
  choiceSubmitted.value = Boolean(cache.choiceSubmitted)
}

function restoreLocalFlow() {
  if (!auth.user?.id || !task.value?.taskId) return false
  const cache = readStudyFlowState(auth.user.id, task.value.taskId)
  if (!cache || !pendingItems.value.length) return false

  const pendingItemMap = createPendingItemMap()
  if (!Array.isArray(cache.flowGroupBatchIds) || !cache.flowGroupBatchIds.length) return false

  const cachedFlowGroups = flowGroupsFromCachedBatchIds(cache.flowGroupBatchIds, pendingItemMap)
  const restoredFlowGroups = cachedFlowGroups.length
    ? cachedFlowGroups
    : buildStudyFlowGroups(pendingItems.value)
  const restoredFlowMode = cache.flowMode === FLOW_RETRY ? FLOW_RETRY : FLOW_SEGMENT
  const restoredPhase = cache.phase === PHASE_CONFIRM ? PHASE_CONFIRM : PHASE_LEARN
  const restoredRetryItems = itemsFromIds(cache.retryItemIds, pendingItemMap)
  const restoredRetryBatches = batchesFromCachedIds(cache.retryBatchIds, pendingItemMap)
  const restoredFlowGroupIndex = resolveFlowGroupIndex(restoredFlowGroups, cache)
  if (restoredFlowGroupIndex < 0) return false

  flowGroups.value = restoredFlowGroups
  flowGroupIndex.value = restoredFlowGroupIndex
  flowMode.value = restoredFlowMode
  phase.value = restoredPhase
  retryItems.value = restoredRetryItems
  retryBatches.value = restoredFlowMode === FLOW_RETRY && restoredRetryBatches.length > 0
    ? restoredRetryBatches
    : []
  nextRetryItems.value = itemsFromIds(cache.nextRetryItemIds, pendingItemMap)
  missedItems.value = itemsFromIds(cache.missedItemIds, pendingItemMap)
  failedFeedbackItemIds.value = new Set(
    (cache.failedFeedbackItemIds || [])
      .map((itemId) => String(itemId))
      .filter((itemId) => pendingItemMap.has(itemId)),
  )

  if (flowMode.value === FLOW_RETRY) {
    if (!retryBatches.value.length) {
      if (!retryItems.value.length) return false
      retryBatches.value = [retryItems.value]
    }
    segmentIndex.value = clampIndex(cache.segmentIndex, retryBatches.value.length - 1)
    retryItems.value = retryBatches.value[segmentIndex.value] || retryItems.value
    activeIndex.value = resolveActiveIndex(retryItems.value, cache.activeItemId, cache.activeIndex)
  } else {
    const preferredSegmentIndex = clampIndex(cache.segmentIndex, itemBatches.value.length - 1)
    const availableSegmentIndex = firstAvailableBatchIndex(itemBatches.value, preferredSegmentIndex)
    if (availableSegmentIndex < 0) return false
    segmentIndex.value = availableSegmentIndex
    activeIndex.value = resolveActiveIndex(currentSegmentItems.value, cache.activeItemId, cache.activeIndex)
  }

  restoreChoiceState(cache)
  saveFlowState()
  return true
}

async function loadTask() {
  if (loading.value || submitting.value) return
  loading.value = true
  try {
    cleanupExpiredStudyFlowStates()
    task.value = queryTaskId.value ? await fetchStudyTask(queryTaskId.value) : await fetchTodayTask()
    needsPlan.value = false
    emptyTitle.value = isWrongPracticeTask.value ? '错词专项已完成' : '暂无待学习卡片'
    emptyDescription.value = isWrongPracticeTask.value
      ? '本组错词已处理，可以返回错词本或继续下一组。'
      : '本组完成后可以继续下一组，也可以回到首页查看统计。'
    if (!isWrongPracticeTask.value && task.value?.status === 'DONE' && !task.value?.clozeAttempted) {
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
  flowGroups.value = buildStudyFlowGroups(pendingItems.value)
  const firstGroupIndex = firstAvailableFlowGroupIndex(flowGroups.value, 0)
  flowGroupIndex.value = firstGroupIndex >= 0 ? firstGroupIndex : 0
  const firstSegmentIndex = firstGroupIndex >= 0 ? firstAvailableBatchIndex(itemBatches.value, 0) : -1
  segmentIndex.value = firstSegmentIndex >= 0 ? firstSegmentIndex : 0
  activeIndex.value = 0
  flowMode.value = FLOW_SEGMENT
  phase.value = PHASE_LEARN
  retryItems.value = []
  retryBatches.value = []
  nextRetryItems.value = []
  missedItems.value = []
  failedFeedbackItemIds.value = new Set()
  resetChoiceState()
  if (!pendingItems.value.length) {
    clearFlowState()
  } else if (persist) {
    saveFlowState()
  }
}

async function loadCard() {
  stopPronunciation()
  hideLookupSelection()
  closeLookup()
  if (!currentItem.value) {
    card.value = null
    cardLoading.value = false
    resetChoiceState()
    return
  }
  const loadingItemId = currentItemIdString()
  cardLoading.value = true
  card.value = null
  try {
    card.value = await fetchTaskItemCard(currentItem.value.itemId)
    aiResult.value = null
    aiQuestion.value = ''
    const canKeepChoiceState = phase.value === PHASE_CONFIRM
      && choiceState.value !== CHOICE_IDLE
      && String(choiceItemId.value) === loadingItemId
      && hasChoiceQuestion.value
    if (!canKeepChoiceState) {
      resetChoiceState()
    }
  } finally {
    cardLoading.value = false
  }
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
  resetChoiceState()
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
  resetChoiceState()
  saveFlowState()
  await advanceAfterConfirm()
}

async function submitUnknownOnce(item) {
  const itemId = String(item.itemId)
  if (failedFeedbackItemIds.value.has(itemId)) return null
  submitting.value = true
  try {
    const response = await submitTaskFeedback(item.itemId, { feedback: 'UNKNOWN', durationSeconds: 0 })
    markFailedFeedbackSubmitted(itemId)
    saveFlowState()
    return response
  } finally {
    submitting.value = false
  }
}

async function rememberCurrentCard() {
  if (!card.value || submitting.value || generatingCloze.value) return
  if (hasChoiceQuestion.value) {
    choiceState.value = CHOICE_CHOOSING
    choiceItemId.value = currentItemIdString()
    selectedOptionWordId.value = null
    choiceFeedback.value = ''
    choiceSubmitted.value = false
    choiceDailyTaskDone.value = false
    saveFlowState()
    return
  }
  ElMessage.warning('选择题暂不可用，请稍后重试')
}

async function selectChoiceOption(option) {
  if (!currentItem.value || !isChoiceChoosing.value || submitting.value || generatingCloze.value) return
  const item = currentItem.value
  const selectedWordId = option?.wordId == null ? null : String(option.wordId)
  if (!selectedWordId) return

  selectedOptionWordId.value = selectedWordId
  const correct = isChoiceOptionCorrect(option)

  if (correct) {
    submitting.value = true
    try {
      const response = await submitTaskFeedback(item.itemId, { feedback: 'KNOWN', durationSeconds: 0 })
      applyFeedbackProgress(response)
      choiceFeedback.value = 'KNOWN'
      choiceSubmitted.value = true
      choiceDailyTaskDone.value = Boolean(response.dailyTaskDone)
      choiceState.value = CHOICE_RESULT
      saveFlowState()
    } finally {
      submitting.value = false
    }
    return
  }

  await submitUnknownOnce(item)
  if (flowMode.value === FLOW_RETRY) {
    addUniqueItem(nextRetryItems, item)
  } else {
    addUniqueItem(missedItems, item)
  }
  choiceFeedback.value = 'UNKNOWN'
  choiceSubmitted.value = true
  choiceDailyTaskDone.value = false
  choiceState.value = CHOICE_RESULT
  saveFlowState()
}

async function advanceAfterChoiceResult() {
  if (!isChoiceResult.value || submitting.value || generatingCloze.value) return
  const shouldFinishTask = choiceDailyTaskDone.value || task.value?.status === 'DONE'
  resetChoiceState()
  if (shouldFinishTask && task.value?.taskId) {
    clearFlowState()
    if (isWrongPracticeTask.value) {
      await loadTask()
      return
    }
    await generateCompletedGroupCloze(task.value.taskId)
    return
  }
  saveFlowState()
  await advanceAfterConfirm()
}

async function advanceAfterConfirm() {
  if (activeIndex.value < activeItems.value.length - 1) {
    activeIndex.value += 1
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
    resetChoiceState()
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
  await moveToNextFlowGroup()
}

async function startRetryRound(items) {
  flowMode.value = FLOW_RETRY
  retryBatches.value = buildItemBatches(items)
  retryItems.value = retryBatches.value[0] || []
  nextRetryItems.value = []
  activeIndex.value = 0
  segmentIndex.value = 0
  phase.value = PHASE_LEARN
  resetChoiceState()
  saveFlowState()
  await loadCard()
}

async function finishRetryRound() {
  if (segmentIndex.value < retryBatches.value.length - 1) {
    segmentIndex.value += 1
    retryItems.value = retryBatches.value[segmentIndex.value] || []
    activeIndex.value = 0
    phase.value = PHASE_LEARN
    resetChoiceState()
    saveFlowState()
    await loadCard()
    return
  }
  if (nextRetryItems.value.length > 0) {
    await startRetryRound(nextRetryItems.value)
    return
  }
  retryBatches.value = []
  await moveToNextFlowGroup()
}

async function moveToNextFlowGroup() {
  const nextGroupIndex = firstAvailableFlowGroupIndex(flowGroups.value, flowGroupIndex.value + 1)
  if (nextGroupIndex >= 0 && nextGroupIndex !== flowGroupIndex.value) {
    flowGroupIndex.value = nextGroupIndex
    segmentIndex.value = firstAvailableBatchIndex(itemBatches.value, 0)
    activeIndex.value = 0
    flowMode.value = FLOW_SEGMENT
    phase.value = PHASE_LEARN
    retryItems.value = []
    retryBatches.value = []
    nextRetryItems.value = []
    missedItems.value = []
    resetChoiceState()
    saveFlowState()
    await loadCard()
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

async function generateCompletedGroupCloze(taskId, extraQuery = {}) {
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
      router.push({ path: '/app/cloze', query: { quizId: task.resultId, auto: '1', ...extraQuery } })
    } else {
      await loadTask()
    }
  } catch (error) {
    await loadTask()
    const quotaExhausted = error.code === 40002 || error.status === 429 || error.message?.includes('配额')
    const message = error.code === 40001
      ? '今日学习已完成，但 AI 配置不可用。可以先去 AI 配置页检查。'
      : quotaExhausted
        ? `今日学习已完成，但 ${AI_QUOTA_EXHAUSTED_MESSAGE}。可以稍后在完形填空页重试。`
        : '今日学习已完成，但完形填空暂时生成失败。可以稍后在完形填空页重试。'
    ElMessage.warning(message)
    router.push({ path: '/app/cloze', query: { generateError: error.code === 40001 ? 'config' : (quotaExhausted ? 'quota' : 'ai') } })
  } finally {
    generatingCloze.value = false
  }
}

async function generateWrongPracticeCloze() {
  if (!task.value?.taskId) return
  await generateCompletedGroupCloze(task.value.taskId, {
    taskId: task.value.taskId,
    mode: 'wrong-practice',
  })
}

async function continueWrongPractice() {
  if (loading.value || submitting.value) return
  try {
    const nextTask = await createWrongWordPractice({ limit: 10 })
    if ((nextTask.extraCount || 0) <= 0) {
      ElMessage.info('暂无可练习的错词')
      return
    }
    router.push({ path: '/app/study', query: { taskId: nextTask.taskId, mode: 'wrong-practice' } })
  } catch (error) {
    ElMessage.info(error?.message || '暂无可练习的错词')
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

function getAiQuestionTextarea() {
  return aiQuestionInputRef.value?.textarea || aiQuestionInputRef.value?.$el?.querySelector('textarea') || null
}

function insertQuestionText(text) {
  const insertText = String(text || '').trim()
  if (!insertText) return

  const textarea = getAiQuestionTextarea()
  const currentText = textarea?.value ?? aiQuestion.value ?? ''
  const start = typeof textarea?.selectionStart === 'number' ? textarea.selectionStart : currentText.length
  const end = typeof textarea?.selectionEnd === 'number' ? textarea.selectionEnd : start
  const before = currentText.slice(0, start)
  const after = currentText.slice(end)
  const leftSpace = before && !/\s$/.test(before) ? ' ' : ''
  const rightSpace = after && !/^\s/.test(after) ? ' ' : ''
  const inserted = `${leftSpace}${insertText}${rightSpace}`

  aiQuestion.value = `${before}${inserted}${after}`
  const cursorPosition = before.length + inserted.length
  nextTick(() => {
    const nextTextarea = getAiQuestionTextarea()
    nextTextarea?.focus()
    nextTextarea?.setSelectionRange(cursorPosition, cursorPosition)
  })
}

async function askAi(regenerate = false) {
  if (!card.value?.wordId || !card.value?.wordbookId || aiLoading.value || aiRegenerating.value || aiStreaming.value) return
  const question = aiQuestion.value.trim()
  if (!question) {
    ElMessage.warning('请输入你想问的问题')
    return
  }
  const wordId = card.value.wordId
  const wordbookId = card.value.wordbookId
  if (aiAbortController) {
    aiAbortController.abort()
  }
  aiAbortController = new AbortController()
  aiLoading.value = !regenerate
  aiRegenerating.value = regenerate
  aiStreaming.value = true
  aiResult.value = {
    cacheHit: false,
    contentType: 'WORD_QA',
    wordId: String(wordId),
    wordbookId: String(wordbookId),
    content: {
      answer: '',
      keyPoints: [],
      relatedWords: [],
      followUps: [],
    },
  }
  try {
    const finalPayload = await streamWordQuestion(
      wordId,
      {
        wordbookId,
        question,
        regenerate,
      },
      {
        signal: aiAbortController.signal,
        onStatus: (status) => {
          if (status?.status === 'CACHE_HIT') {
            aiResult.value.cacheHit = true
          }
        },
        onChunk: (text) => {
          aiLoading.value = false
          if (!text) return
          aiResult.value.content.answer += text
        },
        onDone: (payload) => {
          if (payload?.content) {
            aiResult.value = payload
          }
          aiLoading.value = false
          aiRegenerating.value = false
          aiStreaming.value = false
        },
      },
    )
    if (finalPayload?.content) {
      aiResult.value = finalPayload
    }
  } catch (error) {
    if (error?.name === 'AbortError') return
    if (error.code === 40001 || error.message?.includes('AI 配置')) {
      ElMessage.warning('AI 配置不可用，请先检查公共配置或私有配置。')
    } else if (error.code === 40002 || error.status === 429 || error.message?.includes('配额')) {
      ElMessage.warning('今日公共 AI 调用次数已用完')
    } else {
      ElMessage.warning(error.message || 'AI 问答暂时不可用，请稍后重试。')
    }
  } finally {
    aiLoading.value = false
    aiRegenerating.value = false
    aiStreaming.value = false
    aiAbortController = null
  }
}

function useFollowUp(question) {
  aiQuestion.value = question
  askAi(false)
}

watch(aiDialogVisible, toggleAiDialogBodyClass)
watch(queryTaskId, (nextTaskId, previousTaskId) => {
  if (String(nextTaskId || '') !== String(previousTaskId || '')) {
    loadTask()
  }
})

onMounted(loadTask)
onBeforeUnmount(() => {
  stopPronunciation()
  if (aiAbortController) {
    aiAbortController.abort()
    aiAbortController = null
  }
  if (lookupSelectionRaf) {
    window.cancelAnimationFrame(lookupSelectionRaf)
    lookupSelectionRaf = null
  }
  closeLookup()
  hideLookupSelection()
  toggleAiDialogBodyClass(false)
})
</script>

<template>
  <section class="study-page">
    <PageHeader :title="pageTitle" :subtitle="pageSubtitle" />

    <el-skeleton v-if="loading" :rows="6" animated />
    <el-card v-else-if="!card && generatingCloze" class="panel-card narrow" shadow="never">
      <StarterPanel
        title="本组学习已完成"
        description="正在生成必做完形填空，稍等片刻就会进入练习。"
        :icon="Refresh"
      />
    </el-card>

    <el-card v-else-if="!card && !cardLoading" class="panel-card narrow" shadow="never">
      <StarterPanel
        :title="emptyTitle"
        :description="emptyDescription"
        :icon="needsPlan ? Calendar : Refresh"
        :error="!needsPlan"
      >
        <template v-if="needsPlan">
          <el-button type="primary" @click="router.push('/app/plans')">创建计划</el-button>
          <el-button @click="router.push('/app/wordbooks')">选择词库</el-button>
        </template>
        <template v-else-if="completedWrongPractice">
          <el-button type="primary" @click="router.push('/app/wrong-words')">返回错词本</el-button>
          <el-button @click="continueWrongPractice">继续下一组</el-button>
          <el-button :loading="generatingCloze" :disabled="generatingCloze" @click="generateWrongPracticeCloze">生成完形填空</el-button>
        </template>
        <el-button v-else type="primary" @click="loadTask">重试</el-button>
      </StarterPanel>
    </el-card>

    <div v-else class="study-card-layout">
      <el-card class="study-word-card" shadow="never">
        <div class="word-kind-row">
          <div class="word-card-meta">
            <el-tag :type="flowMode === FLOW_RETRY ? 'warning' : undefined">{{ studyStageLabel }}</el-tag>
            <el-tag type="success" v-if="card?.favorite">已收藏</el-tag>
          </div>
          <div class="study-flow-meta">
            <el-tag effect="plain">{{ flowTitle }}</el-tag>
            <el-tag :type="recallMode ? 'warning' : 'success'" effect="plain">{{ phaseTitle }}</el-tag>
            <el-tag effect="plain">进度：{{ cardPositionLabel }}</el-tag>
          </div>
          <div class="word-card-actions">
            <el-button class="ai-toolbar-button" circle title="AI 问答" aria-label="AI 问答" :disabled="cardLoading || !card" @click="openAiQuestion">
              <span class="ai-toolbar-label" aria-hidden="true">AI</span>
            </el-button>
            <el-button
              circle
              :type="card?.favorite ? 'warning' : 'default'"
              :loading="favoriteOperating"
              :disabled="favoriteOperating || cardLoading || !card"
              :title="card?.favorite ? '取消收藏' : '收藏单词'"
              @click="toggleFavorite"
            >
              <LexiIcon :name="card?.favorite ? 'star-filled' : 'star'" />
            </el-button>
          </div>
        </div>

        <div v-if="cardLoading || !card" class="study-card-loading">
          <el-skeleton animated :rows="6" />
        </div>

        <div
          v-else
          ref="studyCardScrollRef"
          class="study-card-scroll"
          @mouseup="handleStudySelectionChange"
          @keyup="handleStudySelectionChange"
        >
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
            <div v-if="!isChoiceActive && cardSentences.length" class="example-list recall-example-list">
              <div v-for="sentence in cardSentences" :key="`recall-${sentence.key}`" class="example-block recall-example">
                <p v-html="sentence.highlightedEnglish"></p>
              </div>
            </div>
            <div v-if="choiceState !== CHOICE_IDLE && hasChoiceQuestion" class="choice-question-panel">
              <div class="choice-question-head">
                <span>选择正确中文释义</span>
                <strong v-if="isChoiceResult" :class="{ 'is-correct': isChoiceCorrect, 'is-wrong': !isChoiceCorrect }">
                  {{ choiceResultText }}
                </strong>
              </div>
              <div class="choice-option-list">
                <button
                  v-for="option in choiceOptions"
                  :key="option.wordId"
                  type="button"
                  class="choice-option"
                  :class="choiceOptionClass(option)"
                  :disabled="submitting || isChoiceResult"
                  @click="selectChoiceOption(option)"
                >
                  <span>{{ option.pos ? `${option.pos} ${option.definition}` : option.definition }}</span>
                </button>
              </div>
            </div>
          </template>
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

        <div v-if="learningMode && card" class="feedback-row">
          <el-button size="large" type="primary" :loading="submitting || generatingCloze" :disabled="submitting || generatingCloze" @click="goNextLearnCard">
            {{ learnActionLabel }}
          </el-button>
        </div>
        <div v-else-if="card" class="feedback-row">
          <template v-if="choiceState === CHOICE_IDLE">
            <el-button size="large" type="primary" :loading="submitting || generatingCloze" @click="rememberCurrentCard">
              {{ generatingCloze ? '正在生成完形填空' : '认识' }}
            </el-button>
            <el-button size="large" :loading="submitting" :disabled="submitting || generatingCloze" @click="forgetCurrentCard">不认识</el-button>
          </template>
          <template v-else-if="isChoiceChoosing">
            <span class="choice-feedback-tip">请选择一个释义</span>
          </template>
          <template v-else>
            <el-button size="large" type="primary" :loading="generatingCloze" :disabled="submitting || generatingCloze" @click="advanceAfterChoiceResult">
              {{ generatingCloze ? '正在生成完形填空' : '下一个' }}
            </el-button>
          </template>
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

    <el-dialog v-model="aiDialogVisible" title="AI 单词问答" width="680px">
      <div class="ai-question-box">
        <div class="ai-question-word">
          <el-tooltip content="点击插入" effect="light" placement="top">
            <el-tag @click="insertQuestionText(card?.word)">{{ card?.word }}</el-tag>
          </el-tooltip>
          <span v-if="learningMode && card?.primaryDefinition">{{ card.primaryDefinition }}</span>
        </div>
        <el-input
          ref="aiQuestionInputRef"
          v-model.trim="aiQuestion"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          :placeholder="aiQuestionPlaceholder"
        />
        <div class="button-row">
          <el-button :icon="Cpu" @click="router.push('/app/ai-config')">AI 配置</el-button>
          <el-button type="primary" :icon="ChatLineRound" :loading="aiLoading || (aiStreaming && !aiRegenerating)" :disabled="aiLoading || aiRegenerating || aiStreaming" @click="askAi(false)">提问</el-button>
        </div>
      </div>

      <el-skeleton v-if="aiLoading" :rows="5" animated />
      <template v-else-if="aiResult?.content">
        <div class="ai-content-panel">
          <div class="card-header-row">
            <el-tag :type="aiResult.cacheHit ? 'success' : 'info'">{{ aiStreaming ? '生成中' : (aiResult.cacheHit ? '缓存命中' : '新生成') }}</el-tag>
            <el-button size="small" :icon="Refresh" :loading="aiRegenerating" :disabled="aiLoading || aiRegenerating || aiStreaming" @click="askAi(true)">重新回答</el-button>
          </div>

          <div class="ai-brief ai-answer-markdown" v-html="aiAnswerHtml"></div>
          <div v-if="aiResult.content.keyPoints?.length" class="ai-section">
            <h3>要点</h3>
            <ul><li v-for="item in aiResult.content.keyPoints" :key="item" v-html="renderAiInlineMarkdown(item)"></li></ul>
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
      <EmptyState v-else title="还没有提问" description="输入你对这个单词的疑问，例如反义词、语境差异或易混点。" />
    </el-dialog>
  </section>
</template>
