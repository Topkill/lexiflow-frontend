<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, ChatLineRound, Cpu, Refresh, Star, StarFilled } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import StarterPanel from '../../components/StarterPanel.vue'
import { askWordQuestion, createClozeTask } from '../../api/ai'
import { deleteFavoriteWord, favoriteWord } from '../../api/review'
import { fetchTaskItemCard, fetchTodayTask, submitTaskFeedback } from '../../api/study'

const FLOW_SEGMENT = 'segment'
const FLOW_RETRY = 'retry'
const PHASE_LEARN = 'learn'
const PHASE_CONFIRM = 'confirm'

const router = useRouter()
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
const emptyDescription = ref('今日任务完成后可以回到首页查看统计。')
const needsPlan = ref(false)
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const aiRegenerating = ref(false)
const aiResult = ref(null)
const aiQuestion = ref('')

const pendingItems = computed(() => task.value?.items?.filter((item) => item.status === 'PENDING') || [])
const currentSegmentItems = computed(() => itemBatches.value[segmentIndex.value] || [])
const activeItems = computed(() => (flowMode.value === FLOW_RETRY ? retryItems.value : currentSegmentItems.value))
const currentItem = computed(() => activeItems.value[activeIndex.value])
const segmentCount = computed(() => itemBatches.value.length)
const totalItemCount = computed(() => task.value?.progress?.totalCount ?? task.value?.items?.length ?? 0)
const completedItemCount = computed(() => task.value?.progress?.doneCount ?? task.value?.doneCount ?? 0)
const remainingItemCount = computed(() => Math.max(0, totalItemCount.value - completedItemCount.value))
const studyCompletionRate = computed(() => (
  totalItemCount.value > 0
    ? Math.min(100, Math.round((completedItemCount.value / totalItemCount.value) * 100))
    : 0
))
const recallMode = computed(() => phase.value === PHASE_CONFIRM)
const learningMode = computed(() => phase.value === PHASE_LEARN)
const flowTitle = computed(() => (flowMode.value === FLOW_RETRY ? '回看没记住的词' : `第 ${segmentIndex.value + 1}/${segmentCount.value || 1} 段`))
const phaseTitle = computed(() => (learningMode.value ? '完整学习' : '轻量回忆'))
const cardPositionLabel = computed(() => `${Math.min(activeIndex.value + 1, activeItems.value.length || 1)}/${activeItems.value.length || 0}`)
const learnActionLabel = computed(() => {
  if (flowMode.value === FLOW_RETRY) return '我再回忆一次'
  return activeIndex.value >= activeItems.value.length - 1 ? '开始回忆' : '下一个'
})
const flowHint = computed(() => {
  if (generatingCloze.value) return '单词学习已完成，正在生成必做完形填空。'
  if (flowMode.value === FLOW_RETRY) return '这些是刚才没记住的词，先看完整信息，再重新回忆。'
  return learningMode.value ? '先快速理解本段单词，随后会折叠中文释义做轻量回忆。' : '现在只看英文信息，确认自己能不能想起中文意思。'
})
const aiQuestionPlaceholder = computed(() => card.value?.word ? `例如：${card.value.word} 的反义词有哪些？` : '例如：这个词的反义词有哪些？')
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

async function loadTask() {
  loading.value = true
  try {
    task.value = await fetchTodayTask()
    needsPlan.value = false
    emptyTitle.value = '暂无待学习卡片'
    emptyDescription.value = '今日任务完成后可以回到首页查看统计。'
    resetLocalFlow()
    await loadCard()
  } catch (error) {
    task.value = null
    card.value = null
    needsPlan.value = error.code === 30001
    emptyTitle.value = needsPlan.value ? '先创建学习计划' : '暂时无法加载学习卡片'
    emptyDescription.value = needsPlan.value
      ? '选择词库并设置每日新词后，系统会自动生成今天的学习任务。'
      : error.message
  } finally {
    loading.value = false
  }
}

function resetLocalFlow() {
  itemBatches.value = buildItemBatches(pendingItems.value)
  segmentIndex.value = 0
  activeIndex.value = 0
  flowMode.value = FLOW_SEGMENT
  phase.value = PHASE_LEARN
  retryItems.value = []
  nextRetryItems.value = []
  missedItems.value = []
  failedFeedbackItemIds.value = new Set()
}

async function loadCard() {
  if (!currentItem.value) {
    card.value = null
    return
  }
  card.value = await fetchTaskItemCard(currentItem.value.itemId)
  aiResult.value = null
  aiQuestion.value = ''
}

async function goNextLearnCard() {
  if (!card.value || submitting.value || generatingCloze.value) return
  if (flowMode.value === FLOW_RETRY) {
    phase.value = PHASE_CONFIRM
    return
  }
  if (activeIndex.value < activeItems.value.length - 1) {
    activeIndex.value += 1
    await loadCard()
    return
  }
  activeIndex.value = 0
  phase.value = PHASE_CONFIRM
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
  await advanceAfterConfirm()
}

async function submitUnknownOnce(item) {
  const itemId = String(item.itemId)
  if (failedFeedbackItemIds.value.has(itemId)) return
  submitting.value = true
  try {
    await submitTaskFeedback(item.itemId, { feedback: 'UNKNOWN', durationSeconds: 0 })
    markFailedFeedbackSubmitted(itemId)
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
    if (response.dailyTaskDone && task.value?.taskId) {
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
    await loadCard()
    return
  }
  if (missedItems.value.length > 0) {
    await startRetryRound(missedItems.value)
    missedItems.value = []
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
  if (!card.value?.wordbookId || !card.value?.wordId) return
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
  if (!card.value?.wordId || !card.value?.wordbookId) return
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
</script>

<template>
  <section>
    <PageHeader title="单词学习" subtitle="分段学习、轻量回忆，再进入必做完形填空">
      <el-button :icon="Refresh" @click="loadTask">刷新</el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />
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
          <el-button
            circle
            :icon="card.favorite ? StarFilled : Star"
            :type="card.favorite ? 'warning' : 'default'"
            :loading="favoriteOperating"
            :title="card.favorite ? '取消收藏' : '收藏单词'"
            @click="toggleFavorite"
          />
        </div>

        <div class="study-flow-meta">
          <el-tag effect="plain">{{ flowTitle }}</el-tag>
          <el-tag :type="recallMode ? 'warning' : 'success'" effect="plain">{{ phaseTitle }}</el-tag>
          <span>{{ cardPositionLabel }}</span>
        </div>

        <h1>{{ card.word }}</h1>
        <div v-if="card.phonetic0 || card.phonetic1" class="phonetic">
          <span v-if="card.phonetic0">英 {{ card.phonetic0 }}</span>
          <span v-if="card.phonetic1">美 {{ card.phonetic1 }}</span>
        </div>

        <p class="study-flow-hint">{{ flowHint }}</p>

        <template v-if="learningMode">
          <div class="definition-block revealed">
            <span>{{ card.primaryPos }}</span>
            <strong>{{ card.primaryDefinition }}</strong>
          </div>
          <div v-for="sentence in cardSentences" :key="sentence.key" class="example-block">
            <p v-html="sentence.highlightedEnglish"></p>
            <span>{{ sentence.cn }}</span>
            <div v-if="sentence.phrase" class="example-phrase">
              <span>搭配</span>
              <strong>{{ sentence.phrase }}</strong>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="recall-panel">
            <span>现在回忆中文释义</span>
            <p>先别看中文，试着根据单词、音标和英文例句说出意思。</p>
          </div>
          <div v-for="sentence in cardSentences" :key="`recall-${sentence.key}`" class="example-block recall-example">
            <p v-html="sentence.highlightedEnglish"></p>
          </div>
        </template>

        <div class="ai-action-row">
          <el-button :icon="ChatLineRound" @click="openAiQuestion">AI 问答</el-button>
        </div>

        <div v-if="learningMode" class="feedback-row">
          <el-button size="large" type="primary" :loading="submitting || generatingCloze" :disabled="submitting || generatingCloze" @click="goNextLearnCard">
            {{ learnActionLabel }}
          </el-button>
        </div>
        <div v-else class="feedback-row">
          <el-button size="large" :loading="submitting" :disabled="submitting || generatingCloze" @click="forgetCurrentCard">还是没记住</el-button>
          <el-button size="large" type="primary" :loading="submitting || generatingCloze" @click="rememberCurrentCard">
            {{ generatingCloze ? '正在生成完形填空' : '想起来了' }}
          </el-button>
        </div>
      </el-card>

      <el-card class="panel-card progress-side" shadow="never">
        <template #header>学习组</template>
        <el-progress :percentage="studyCompletionRate" />
        <div class="task-lines vertical">
          <span>{{ flowTitle }} · {{ phaseTitle }}</span>
          <span>本轮 {{ cardPositionLabel }}</span>
          <span>待完成 {{ remainingItemCount }}</span>
          <span>已完成 {{ completedItemCount }}</span>
          <span>总计 {{ totalItemCount }}</span>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="aiDialogVisible" title="AI 单词问答" width="680px">
      <div class="ai-question-box">
        <div class="ai-question-word">
          <el-tag>{{ card?.word }}</el-tag>
          <span>{{ card?.primaryDefinition }}</span>
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
          <el-button type="primary" :icon="ChatLineRound" :loading="aiLoading" @click="askAi(false)">提问</el-button>
        </div>
      </div>

      <el-skeleton v-if="aiLoading" :rows="5" animated />
      <template v-else-if="aiResult?.content">
        <div class="ai-content-panel">
          <div class="card-header-row">
            <el-tag :type="aiResult.cacheHit ? 'success' : 'info'">{{ aiResult.cacheHit ? '缓存命中' : '新生成' }}</el-tag>
            <el-button size="small" :icon="Refresh" :loading="aiRegenerating" @click="askAi(true)">重新回答</el-button>
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
