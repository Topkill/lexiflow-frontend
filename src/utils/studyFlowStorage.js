const PREFIX = 'lexiflow_study_flow:'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

function canUseStorage() {
  return typeof localStorage !== 'undefined'
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
      localStorage.removeItem(key)
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
    }
  } catch {
    localStorage.removeItem(key)
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
  localStorage.removeItem(key)
}

export function cleanupExpiredStudyFlowStates() {
  if (!canUseStorage()) return
  const now = Date.now()
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(PREFIX)) continue
    try {
      const state = JSON.parse(localStorage.getItem(key) || 'null')
      if (isExpired(state, now)) {
        localStorage.removeItem(key)
      }
    } catch {
      localStorage.removeItem(key)
    }
  }
}
