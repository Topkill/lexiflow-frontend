const PREFIX = 'lexiflow_study_flow:'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

function canUseStorage() {
  return typeof localStorage !== 'undefined'
}

/**
 * 安全删除：存储被禁用（隐私模式 / 企业策略）或访问本身抛错时，清理失败不应影响学习流程。
 * 读路径的 catch 分支也会调用它——若这里再抛，异常会从错误处理里逃出去。
 */
function safeRemove(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 忽略：缓存清理属于尽力而为
  }
}

function buildKey(userId, dailyTaskId) {
  if (!userId || !dailyTaskId) return null
  return `${PREFIX}${String(userId)}:${String(dailyTaskId)}`
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item)).filter(Boolean))]
}

function normalizeItemBatchIds(value) {
  if (!Array.isArray(value)) return []
  return value.map((ids) => normalizeIdList(ids))
}

function normalizeFlowGroupBatchIds(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((group) => ({
      key: String(group?.key || '').trim().toUpperCase(),
      itemBatchIds: normalizeItemBatchIds(group?.itemBatchIds),
    }))
    .filter((group) => group.key && group.itemBatchIds.some((ids) => ids.length > 0))
}

function normalizeChoiceState(value) {
  const state = String(value || 'idle').trim().toLowerCase()
  return ['idle', 'choosing', 'result'].includes(state) ? state : 'idle'
}

function normalizeChoiceFeedback(value) {
  const feedback = String(value || '').trim().toUpperCase()
  return ['KNOWN', 'UNKNOWN'].includes(feedback) ? feedback : ''
}

function isExpired(state, now = Date.now()) {
  return !state?.expiresAt || Number(state.expiresAt) <= now
}

export function readStudyFlowState(userId, dailyTaskId) {
  if (!canUseStorage()) return null
  const key = buildKey(userId, dailyTaskId)
  if (!key) return null

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const state = JSON.parse(raw)
    if (String(state?.dailyTaskId) !== String(dailyTaskId) || isExpired(state)) {
      safeRemove(key)
      return null
    }
    return {
      ...state,
      itemBatchIds: normalizeItemBatchIds(state.itemBatchIds),
      flowGroupBatchIds: normalizeFlowGroupBatchIds(state.flowGroupBatchIds),
      retryItemIds: normalizeIdList(state.retryItemIds),
      nextRetryItemIds: normalizeIdList(state.nextRetryItemIds),
      missedItemIds: normalizeIdList(state.missedItemIds),
      failedFeedbackItemIds: normalizeIdList(state.failedFeedbackItemIds),
      choiceState: normalizeChoiceState(state.choiceState),
      choiceItemId: state.choiceItemId == null ? null : String(state.choiceItemId),
      selectedOptionWordId: state.selectedOptionWordId == null ? null : String(state.selectedOptionWordId),
      choiceFeedback: normalizeChoiceFeedback(state.choiceFeedback),
      choiceSubmitted: Boolean(state.choiceSubmitted),
    }
  } catch {
    safeRemove(key)
    return null
  }
}

export function writeStudyFlowState(userId, dailyTaskId, payload) {
  if (!canUseStorage()) return
  const key = buildKey(userId, dailyTaskId)
  if (!key) return

  const now = Date.now()
  const state = {
    ...payload,
    dailyTaskId: String(dailyTaskId),
    activeItemId: payload.activeItemId == null ? null : String(payload.activeItemId),
    flowGroupKey: payload.flowGroupKey == null ? null : String(payload.flowGroupKey),
    updatedAt: now,
    expiresAt: now + TTL_MS,
    itemBatchIds: normalizeItemBatchIds(payload.itemBatchIds),
    flowGroupBatchIds: normalizeFlowGroupBatchIds(payload.flowGroupBatchIds),
    retryItemIds: normalizeIdList(payload.retryItemIds),
    nextRetryItemIds: normalizeIdList(payload.nextRetryItemIds),
    missedItemIds: normalizeIdList(payload.missedItemIds),
    failedFeedbackItemIds: normalizeIdList(payload.failedFeedbackItemIds),
    choiceState: normalizeChoiceState(payload.choiceState),
    choiceItemId: payload.choiceItemId == null ? null : String(payload.choiceItemId),
    selectedOptionWordId: payload.selectedOptionWordId == null ? null : String(payload.selectedOptionWordId),
    choiceFeedback: normalizeChoiceFeedback(payload.choiceFeedback),
    choiceSubmitted: Boolean(payload.choiceSubmitted),
  }

  try {
    localStorage.setItem(key, JSON.stringify(state))
  } catch {
    // localStorage may be full or blocked; learning can continue without local recovery.
  }
}

export function removeStudyFlowState(userId, dailyTaskId) {
  if (!canUseStorage()) return
  const key = buildKey(userId, dailyTaskId)
  if (!key) return
  safeRemove(key)
}

export function cleanupExpiredStudyFlowStates() {
  if (!canUseStorage()) return
  const now = Date.now()
  let total
  try {
    total = localStorage.length
  } catch {
    return
  }
  for (let index = total - 1; index >= 0; index -= 1) {
    let key
    try {
      key = localStorage.key(index)
    } catch {
      return
    }
    if (!key?.startsWith(PREFIX)) continue
    try {
      const state = JSON.parse(localStorage.getItem(key) || 'null')
      if (isExpired(state, now)) safeRemove(key)
    } catch {
      safeRemove(key)
    }
  }
}
