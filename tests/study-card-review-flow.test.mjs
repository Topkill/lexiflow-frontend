import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
import { computed, ref } from 'vue'

// Exercise the real setup functions with Vue reactivity; only browser/API boundaries are mocked.
const component = readFileSync(new URL('../src/views/app/StudyCardView.vue', import.meta.url), 'utf8')
const setup = component.match(/<script setup>([\s\S]*?)<\/script>/)[1]
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?$/gm, '')

function createFlow(types = ['REVIEW', 'REVIEW']) {
  let saved
  const submissions = []
  const makeCard = (itemId) => ({
    itemId, wordId: itemId, wordbookId: 'book', word: 'example', primaryDefinition: '释义',
    choiceQuestion: { correctIndex: 0, options: [1, 2, 3, 4].map((id) => ({ wordId: String(id) })) },
  })
  const context = vm.createContext({
    crypto: webcrypto, computed, ref, nextTick: async () => {}, watch: () => {}, onMounted: () => {}, onBeforeUnmount: () => {},
    useRoute: () => ({ query: {} }), useRouter: () => ({ push: () => {} }),
    useAuthStore: () => ({ user: { id: 'user' } }),
    MarkdownIt: class {}, ElMessage: { warning: () => {} },
    window: { localStorage: { getItem: () => null, removeItem: () => {} } },
    readStudyFlowState: () => saved,
    writeStudyFlowState: (_user, _task, state) => { saved = JSON.parse(JSON.stringify(state)) },
    removeStudyFlowState: () => { saved = undefined },
    fetchTaskItemCard: async (id) => makeCard(id),
    submitTaskFeedback: async (itemId, request) => { submissions.push({ itemId, ...request }); return {} },
  })
  vm.runInContext(`${setup}\nglobalThis.flow = {
    task, card, phase, learningMode, choiceState, flowMode, currentItem, missedItems,
    segmentIndex, resetLocalFlow, restoreLocalFlow, saveFlowState, loadCard,
    rememberCurrentCard, forgetCurrentCard, goNextLearnCard, finishSegmentRound,
    moveToNextFlowGroup, startRetryRound
  }`, context)
  const flow = context.flow
  flow.task.value = {
    taskId: 'task', status: 'PENDING', taskType: 'DAILY',
    items: types.map((itemType, index) => ({ itemId: String(index + 1), itemType, status: 'PENDING' })),
  }
  flow.resetLocalFlow()
  flow.card.value = makeCard('1')
  return { flow, submissions, getCache: () => saved, setCache: (cache) => { saved = cache } }
}

test('review starts with recognition, and known opens the choice without submitting success', async () => {
  const { flow, submissions } = createFlow()
  assert.equal(flow.phase.value, 'confirm')
  assert.equal(flow.learningMode.value, false)
  await flow.rememberCurrentCard()
  assert.equal(flow.choiceState.value, 'choosing')
  assert.equal(flow.learningMode.value, false)
  assert.equal(submissions.length, 0)
})

test('unknown submits once, reveals only this word, then resumes hidden-answer review', async () => {
  const { flow, submissions } = createFlow()
  await flow.forgetCurrentCard()
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0].feedback, 'UNKNOWN')
  assert.equal(flow.phase.value, 'review-reveal')
  assert.equal(flow.learningMode.value, true)
  assert.equal(flow.currentItem.value.itemId, '1')
  assert.equal(flow.missedItems.value.length, 1)
  await flow.goNextLearnCard()
  assert.equal(flow.currentItem.value.itemId, '2')
  assert.equal(flow.phase.value, 'confirm')
  assert.equal(flow.learningMode.value, false)
  assert.equal(submissions.length, 1)
})

test('new words and retry still learn first; entering review and its next segment skip learning', async () => {
  const { flow } = createFlow(['NEW', ...Array(12).fill('REVIEW')])
  assert.equal(flow.phase.value, 'learn')
  await flow.moveToNextFlowGroup()
  assert.equal(flow.phase.value, 'confirm')
  await flow.finishSegmentRound()
  assert.equal(flow.segmentIndex.value, 1)
  assert.equal(flow.phase.value, 'confirm')
  await flow.startRetryRound([flow.currentItem.value])
  assert.equal(flow.phase.value, 'learn')
  flow.saveFlowState()
  assert.equal(flow.restoreLocalFlow(), true)
  assert.equal(flow.phase.value, 'learn')
})

test('last unknown word reveals before starting the retry round', async () => {
  const { flow } = createFlow(['REVIEW'])
  await flow.forgetCurrentCard()
  assert.equal(flow.phase.value, 'review-reveal')
  await flow.goNextLearnCard()
  assert.equal(flow.flowMode.value, 'retry')
  assert.equal(flow.phase.value, 'learn')
  assert.equal(flow.currentItem.value.itemId, '1')
})

test('refresh restores a failed word reveal and an in-progress choice', async () => {
  const { flow, submissions } = createFlow()
  await flow.forgetCurrentCard()
  assert.equal(flow.restoreLocalFlow(), true)
  assert.equal(flow.phase.value, 'review-reveal')
  assert.equal(submissions.length, 1)
  await flow.goNextLearnCard()
  await flow.rememberCurrentCard()
  assert.equal(flow.restoreLocalFlow(), true)
  assert.equal(flow.phase.value, 'confirm')
  assert.equal(flow.choiceState.value, 'choosing')
})

test('legacy learn caches and unconfirmed reveal caches cannot expose review answers', () => {
  const { flow, getCache, setCache } = createFlow()
  setCache({ ...getCache(), phase: 'learn' })
  assert.equal(flow.restoreLocalFlow(), true)
  assert.equal(flow.learningMode.value, false)
  assert.equal(getCache().phase, 'confirm')
  setCache({ ...getCache(), phase: 'review-reveal' })
  assert.equal(flow.restoreLocalFlow(), true)
  assert.equal(flow.learningMode.value, false)
  assert.equal(getCache().phase, 'confirm')
})
