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

const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const generatingCloze = ref(false)
const favoriteOperating = ref(false)
const task = ref(null)
const currentIndex = ref(0)
const card = ref(null)
const answerVisible = ref(false)
const lastFeedback = ref('')
const reinforceHint = ref('')
const reinforceCount = ref(0)
const emptyTitle = ref('暂无待学习卡片')
const emptyDescription = ref('今日任务完成后可以回到首页查看统计。')
const needsPlan = ref(false)
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const aiRegenerating = ref(false)
const aiResult = ref(null)
const aiQuestion = ref('')

const pendingItems = computed(() => task.value?.items?.filter((item) => item.status === 'PENDING') || [])
const currentItem = computed(() => pendingItems.value[currentIndex.value])
const feedbackTip = computed(() => reinforceHint.value || ({ UNKNOWN: '先看释义和例句，再尝试回忆一次；确认记住后点认识。', VAGUE: '再巩固一下这张卡片，能稳定想起后点认识。' })[lastFeedback.value] || '')
const feedbackLabels = computed(() => (answerVisible.value
  ? { unknown: '仍不认识', vague: '还是模糊', known: '认识了' }
  : { unknown: '不认识', vague: '模糊', known: '认识' }))
const aiQuestionPlaceholder = computed(() => card.value?.word ? `例如：${card.value.word} 的反义词有哪些？` : '例如：这个词的反义词有哪些？')
const cardSentences = computed(() => {
  if (!card.value?.sentences) return []
  try {
    const sentences = typeof card.value.sentences === 'string' ? JSON.parse(card.value.sentences) : card.value.sentences
    return Array.isArray(sentences) ? sentences.slice(0, 3) : []
  } catch {
    return []
  }
})

async function loadTask() {
  loading.value = true
  try {
    task.value = await fetchTodayTask()
    needsPlan.value = false
    emptyTitle.value = '暂无待学习卡片'
    emptyDescription.value = '今日任务完成后可以回到首页查看统计。'
    currentIndex.value = 0
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

async function loadCard() {
  if (!currentItem.value) {
    card.value = null
    return
  }
  card.value = await fetchTaskItemCard(currentItem.value.itemId)
  answerVisible.value = false
  lastFeedback.value = ''
  reinforceHint.value = ''
  reinforceCount.value = 0
  aiResult.value = null
  aiQuestion.value = ''
}

async function feedback(value) {
  if (!card.value) return
  if (answerVisible.value && value !== 'KNOWN') {
    lastFeedback.value = value
    reinforceCount.value += 1
    reinforceHint.value = value === 'UNKNOWN'
      ? `已保留在当前卡片，再读一遍释义和例句；记住后点“认识了”。${reinforceCount.value > 1 ? `已巩固 ${reinforceCount.value} 次。` : ''}`
      : `已保留在当前卡片，先遮住释义回忆一次；稳定想起后点“认识了”。${reinforceCount.value > 1 ? `已巩固 ${reinforceCount.value} 次。` : ''}`
    return
  }
  if (!answerVisible.value && value !== 'KNOWN') {
    answerVisible.value = true
    lastFeedback.value = value
    reinforceHint.value = ''
    reinforceCount.value = 0
  }
  submitting.value = true
  try {
    const response = await submitTaskFeedback(card.value.itemId, { feedback: value, durationSeconds: 0 })
    if (value === 'KNOWN') {
      if (response.dailyTaskDone && task.value?.taskId) {
        await generateCompletedGroupCloze(task.value.taskId)
        return
      }
      await loadTask()
    }
  } finally {
    submitting.value = false
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
    <PageHeader title="单词学习" subtitle="卡片式完成今日新词和到期复习">
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
        <h1>{{ card.word }}</h1>
        <div v-if="card.phonetic0 || card.phonetic1" class="phonetic">
          <span v-if="card.phonetic0">英 {{ card.phonetic0 }}</span>
          <span v-if="card.phonetic1">美 {{ card.phonetic1 }}</span>
        </div>
        <div v-if="!answerVisible" class="recall-panel">
          <span>先回忆释义</span>
          <p>想不起或不确定时，点“不认识”或“模糊”查看答案并继续巩固。</p>
        </div>
        <template v-else>
          <div class="definition-block revealed">
            <span>{{ card.primaryPos }}</span>
            <strong>{{ card.primaryDefinition }}</strong>
          </div>
          <div v-for="sentence in cardSentences" :key="sentence.c" class="example-block">
            <p>{{ sentence.c }}</p>
            <span>{{ sentence.cn }}</span>
          </div>
          <el-alert v-if="feedbackTip" class="feedback-hint" :title="feedbackTip" type="info" show-icon :closable="false" />
        </template>
        <div class="ai-action-row">
          <el-button :icon="ChatLineRound" @click="openAiQuestion">AI 问答</el-button>
        </div>
        <div class="feedback-row">
          <el-button size="large" :loading="submitting" :disabled="generatingCloze" @click="feedback('UNKNOWN')">{{ feedbackLabels.unknown }}</el-button>
          <el-button size="large" :loading="submitting" :disabled="generatingCloze" @click="feedback('VAGUE')">{{ feedbackLabels.vague }}</el-button>
          <el-button size="large" type="primary" :loading="submitting || generatingCloze" @click="feedback('KNOWN')">
            {{ generatingCloze ? '正在生成完形填空' : feedbackLabels.known }}
          </el-button>
        </div>
      </el-card>

      <el-card class="panel-card progress-side" shadow="never">
        <template #header>学习组</template>
        <el-progress :percentage="task?.items?.length ? Math.round(((task.doneCount || 0) / task.items.length) * 100) : 0" />
        <div class="task-lines vertical">
          <span>待完成 {{ pendingItems.length }}</span>
          <span>已完成 {{ task?.doneCount || 0 }}</span>
          <span>总计 {{ task?.items?.length || 0 }}</span>
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
