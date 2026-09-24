import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  cleanupExpiredStudyFlowStates,
  readStudyFlowState,
  removeStudyFlowState,
  writeStudyFlowState,
} from '../src/utils/studyFlowStorage.js'

// 浏览器里 localStorage 可能在隐私模式、被禁用存储、配额耗尽或企业策略下抛错。
// 学习流程不能因此中断——这些用例直接跑真实的存储模块，而不是组件里的 mock。

function useStorage(storage) {
  globalThis.localStorage = storage
  return storage
}

function throwingStorage() {
  const boom = () => {
    throw new DOMException('storage blocked', 'SecurityError')
  }
  return { getItem: boom, setItem: boom, removeItem: boom, key: boom, get length() { return boom() } }
}

test('writeStudyFlowState 在存储抛错时静默降级，不中断学习', () => {
  useStorage(throwingStorage())
  assert.doesNotThrow(() => writeStudyFlowState('user-1', 'task-1', { phase: 'confirm' }))
})

test('readStudyFlowState 在存储抛错时返回 null，而不是让任务加载失败', () => {
  useStorage(throwingStorage())
  assert.equal(readStudyFlowState('user-1', 'task-1'), null)
})

test('removeStudyFlowState 在存储抛错时应静默', () => {
  useStorage(throwingStorage())
  assert.doesNotThrow(() => removeStudyFlowState('user-1', 'task-1'))
})

test('cleanupExpiredStudyFlowStates 在存储抛错时应静默', () => {
  useStorage(throwingStorage())
  assert.doesNotThrow(() => cleanupExpiredStudyFlowStates())
})

test('清理过期缓存不会误删未过期的学习进度', () => {
  const store = new Map()
  useStorage({
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  })

  const key = 'lexiflow_study_flow:user-1:task-1'
  store.set(key, JSON.stringify({ phase: 'confirm', expiresAt: Date.now() + 60_000 }))
  store.set('unrelated_key', 'x')

  cleanupExpiredStudyFlowStates()
  assert.ok(store.has(key), '未过期的学习进度不应被清理')
  assert.ok(store.has('unrelated_key'), '非本模块的键不应被触碰')

  store.set(key, JSON.stringify({ phase: 'confirm', expiresAt: Date.now() - 1 }))
  cleanupExpiredStudyFlowStates()
  assert.equal(store.has(key), false, '已过期的缓存应被清理')
})
