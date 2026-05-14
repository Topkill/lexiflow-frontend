<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatLineRound, Cpu, MagicStick, Refresh, Sunny } from '@element-plus/icons-vue'
import PageHeader from '../../components/PageHeader.vue'
import EmptyState from '../../components/EmptyState.vue'
import { generateWordExamples, generateWordExplanation, generateWordMnemonic } from '../../api/ai'
import { fetchTaskItemCard, fetchTodayTask, submitTaskFeedback } from '../../api/study'

const router = useRouter()
const loading = ref(false)
const submitting = ref(false)
const task = ref(null)
const currentIndex = ref(0)
const card = ref(null)
const answerVisible = ref(false)
const lastFeedback = ref('')
const emptyTitle = ref('暂无待学习卡片')
const emptyDescription = ref('今日任务完成后可以回到首页查看统计。')
const needsPlan = ref(false)
const aiDialogVisible = ref(false)
const aiLoading = ref(false)
const aiRegenerating = ref(false)
const aiResult = ref(null)
const aiType = ref('EXPLANATION')

const pendingItems = computed(() => task.value?.items?.filter((item) => item.status === 'PENDING') || [])
const currentItem = computed(() => pendingItems.value[currentIndex.value])
const aiTitle = computed(() => ({ EXPLANATION: 'AI 单词讲解', EXAMPLES: 'AI 例句生成', MNEMONIC: 'AI 记忆法' })[aiType.value] || 'AI 辅助')
const feedbackTip = computed(() => ({ UNKNOWN: '先看释义和例句，再尝试回忆一次；确认记住后点认识。', VAGUE: '再巩固一下这张卡片，能稳定想起后点认识。' })[lastFeedback.value] || '')
const feedbackLabels = computed(() => (answerVisible.value
  ? { unknown: '仍不认识', vague: '还是模糊', known: '认识了' }
  : { unknown: '不认识', vague: '模糊', known: '认识' }))

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
      ? '选择词库并设置每日新词数量后，就可以开始第一组单词学习。'
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
}

async function feedback(value) {
  if (!card.value) return
  if (!answerVisible.value && value !== 'KNOWN') {
    answerVisible.value = true
    lastFeedback.value = value
  }
  submitting.value = true
  try {
    await submitTaskFeedback(card.value.itemId, { feedback: value, durationSeconds: 0 })
    if (value === 'KNOWN') {
      await loadTask()
    }
  } finally {
    submitting.value = false
  }
}

async function openAi(type) {
  aiType.value = type
  aiDialogVisible.value = true
  await loadAiContent(false)
}

async function regenerateAi() {
  await loadAiContent(true)
}

async function loadAiContent(regenerate) {
  if (!card.value?.wordId || !card.value?.wordbookId) return
  aiLoading.value = !regenerate
  aiRegenerating.value = regenerate
  try {
    const requestMap = {
      EXPLANATION: generateWordExplanation,
      EXAMPLES: generateWordExamples,
      MNEMONIC: generateWordMnemonic,
    }
    aiResult.value = await requestMap[aiType.value](card.value.wordId, card.value.wordbookId, regenerate)
  } finally {
    aiLoading.value = false
    aiRegenerating.value = false
  }
}

onMounted(loadTask)
</script>

<template>
  <section>
    <PageHeader title="单词学习" subtitle="卡片式完成今日新词和到期复习">
      <el-button :icon="Refresh" @click="loadTask">刷新</el-button>
    </PageHeader>

    <el-skeleton v-if="loading" :rows="6" animated />
    <EmptyState v-else-if="!card" :title="emptyTitle" :description="emptyDescription">
      <el-button v-if="needsPlan" type="primary" @click="router.push('/app/plans')">创建计划</el-button>
      <el-button v-if="needsPlan" @click="router.push('/app/wordbooks')">选择词库</el-button>
    </EmptyState>

    <div v-else class="study-card-layout">
      <el-card class="study-word-card" shadow="never">
        <div class="word-kind-row">
          <el-tag>{{ card.itemType }}</el-tag>
          <el-tag type="success" v-if="card.favorite">已收藏</el-tag>
          <span>{{ card.masteryStatus }}</span>
        </div>
        <h1>{{ card.displayText }}</h1>
        <p class="phonetic">{{ card.phoneticUs || card.phoneticUk }}</p>
        <div v-if="!answerVisible" class="recall-panel">
          <span>先回忆释义</span>
          <p>想不起或不确定时，点“不认识”或“模糊”查看答案并继续巩固。</p>
        </div>
        <template v-else>
          <div class="definition-block revealed">
            <span>{{ card.primaryPos }}</span>
            <strong>{{ card.primaryDefinition }}</strong>
          </div>
          <div v-if="card.exampleSentence" class="example-block">
            <p>{{ card.exampleSentence }}</p>
            <span>{{ card.exampleTranslation }}</span>
          </div>
          <el-alert v-if="feedbackTip" class="feedback-hint" :title="feedbackTip" type="info" show-icon :closable="false" />
        </template>
        <div class="ai-action-row">
          <el-button :icon="ChatLineRound" @click="openAi('EXPLANATION')">AI 讲解</el-button>
          <el-button :icon="MagicStick" @click="openAi('EXAMPLES')">AI 例句</el-button>
          <el-button :icon="Sunny" @click="openAi('MNEMONIC')">AI 记忆法</el-button>
        </div>
        <div class="feedback-row">
          <el-button size="large" :loading="submitting" @click="feedback('UNKNOWN')">{{ feedbackLabels.unknown }}</el-button>
          <el-button size="large" :loading="submitting" @click="feedback('VAGUE')">{{ feedbackLabels.vague }}</el-button>
          <el-button size="large" type="primary" :loading="submitting" @click="feedback('KNOWN')">{{ feedbackLabels.known }}</el-button>
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

    <el-dialog v-model="aiDialogVisible" :title="aiTitle" width="680px">
      <el-skeleton v-if="aiLoading" :rows="6" animated />
      <template v-else-if="aiResult?.content">
        <div class="ai-content-panel">
          <div class="card-header-row">
            <el-tag :type="aiResult.cacheHit ? 'success' : 'info'">{{ aiResult.cacheHit ? '缓存命中' : '新生成' }}</el-tag>
            <el-button size="small" :icon="Refresh" :loading="aiRegenerating" @click="regenerateAi">重新生成</el-button>
          </div>

          <template v-if="aiType === 'EXPLANATION'">
            <p class="ai-brief">{{ aiResult.content.brief }}</p>
            <div v-if="aiResult.content.usage?.length" class="ai-section">
              <h3>常见用法</h3>
              <ul><li v-for="item in aiResult.content.usage" :key="item">{{ item }}</li></ul>
            </div>
            <div v-if="aiResult.content.confusingWords?.length" class="ai-section">
              <h3>近义词或易混词</h3>
              <ul><li v-for="item in aiResult.content.confusingWords" :key="item">{{ item }}</li></ul>
            </div>
            <div v-if="aiResult.content.scenes?.length" class="ai-section">
              <h3>使用场景</h3>
              <ul><li v-for="item in aiResult.content.scenes" :key="item">{{ item }}</li></ul>
            </div>
          </template>

          <template v-else-if="aiType === 'EXAMPLES'">
            <div v-for="level in ['simple', 'medium', 'examStyle']" :key="level" class="ai-example-item">
              <el-tag>{{ { simple: '简单', medium: '中等', examStyle: '考试风格' }[level] }}</el-tag>
              <p>{{ aiResult.content[level]?.sentence }}</p>
              <span>{{ aiResult.content[level]?.translation }}</span>
            </div>
          </template>

          <template v-else>
            <div class="ai-section">
              <h3>联想记忆</h3>
              <p>{{ aiResult.content.association }}</p>
            </div>
            <div class="ai-section">
              <h3>词根词缀</h3>
              <p>{{ aiResult.content.rootsAffixes }}</p>
            </div>
            <div v-if="aiResult.content.pitfalls?.length" class="ai-section">
              <h3>易错提醒</h3>
              <ul><li v-for="item in aiResult.content.pitfalls" :key="item">{{ item }}</li></ul>
            </div>
          </template>
        </div>
      </template>
      <EmptyState v-else title="暂无 AI 内容" description="请稍后重试，或检查 AI 配置是否可用。">
        <el-button :icon="Cpu" @click="router.push('/app/ai-config')">AI 配置</el-button>
      </EmptyState>
    </el-dialog>
  </section>
</template>
