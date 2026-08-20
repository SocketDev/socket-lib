/**
 * @file Unit tests for paths/rewire.ts — `getPathValue`, `hasOverride`,
 *   `invalidateCaches`, `registerCacheInvalidation`. Other path tests use
 *   setPath/clearPath/resetPaths transitively; this file targets the
 *   non-mutator surface directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPath,
  getPathValue,
  hasOverride,
  invalidateCaches,
  registerCacheInvalidation,
  resetPaths,
  setPath,
} from '../../../src/paths/rewire.mjs'

beforeEach(() => {
  resetPaths()
})

afterEach(() => {
  resetPaths()
})

describe.sequential('paths/rewire — getPathValue', () => {
  it('returns the override when one is set', () => {
    setPath('test-key-x', '/override/path')
    expect(getPathValue('test-key-x', () => '/computed')).toBe('/override/path')
  })

  it('computes the value fresh from originalFn when no override is set', () => {
    const fn = vi.fn(() => '/computed-value')
    const a = getPathValue('cache-test-key', fn)
    const b = getPathValue('cache-test-key', fn)
    expect(a).toBe('/computed-value')
    expect(b).toBe(a)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('recomputes on every call, so a changed input is reflected without an override', () => {
    // originalFn's typical inputs (env vars, os.homedir()/os.tmpdir()) can
    // change without going through setPath — a long-lived memo keyed only
    // on `key` would keep serving the value computed against the OLD input.
    let current = '/v1'
    const fn = vi.fn(() => current)
    expect(getPathValue('recompute-key', fn)).toBe('/v1')
    current = '/v2'
    expect(getPathValue('recompute-key', fn)).toBe('/v2')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('returns the override even after computing+caching first', () => {
    getPathValue('mixed-key', () => '/from-fn')
    setPath('mixed-key', '/from-override')
    expect(getPathValue('mixed-key', () => '/from-fn-2')).toBe('/from-override')
  })
})

describe.sequential('paths/rewire — hasOverride', () => {
  it('returns true after setPath', () => {
    setPath('h-key-1', '/v')
    expect(hasOverride('h-key-1')).toBe(true)
  })

  it('returns false when no override has been set', () => {
    expect(hasOverride('never-set-key')).toBe(false)
  })

  it('returns false after clearPath', () => {
    setPath('h-key-2', '/v')
    clearPath('h-key-2')
    expect(hasOverride('h-key-2')).toBe(false)
  })
})

describe.sequential('paths/rewire — invalidateCaches', () => {
  it('does not affect a subsequent getPathValue call (nothing memoized to drop)', () => {
    const fn = vi.fn(() => '/v1')
    getPathValue('inv-key', fn)
    expect(fn).toHaveBeenCalledTimes(1)
    invalidateCaches()
    const fn2 = vi.fn(() => '/v2')
    expect(getPathValue('inv-key', fn2)).toBe('/v2')
    expect(fn2).toHaveBeenCalledTimes(1)
  })

  it('invokes registered cache-invalidation callbacks', () => {
    const cb = vi.fn()
    registerCacheInvalidation(cb)
    invalidateCaches()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('swallows errors from registered callbacks', () => {
    const cbErr = vi.fn(() => {
      throw new Error('callback-boom')
    })
    const cbOk = vi.fn()
    registerCacheInvalidation(cbErr)
    registerCacheInvalidation(cbOk)
    // Should not throw despite cbErr throwing; cbOk still runs.
    expect(() => invalidateCaches()).not.toThrow()
    expect(cbErr).toHaveBeenCalledTimes(1)
    expect(cbOk).toHaveBeenCalledTimes(1)
  })

  it('is called transitively by clearPath', () => {
    const cb = vi.fn()
    registerCacheInvalidation(cb)
    setPath('cb-key', '/v')
    cb.mockClear() // ignore the invalidation triggered by setPath
    clearPath('cb-key')
    expect(cb).toHaveBeenCalled()
  })

  it('is called transitively by resetPaths', () => {
    const cb = vi.fn()
    registerCacheInvalidation(cb)
    setPath('reset-key', '/v')
    cb.mockClear()
    resetPaths()
    expect(cb).toHaveBeenCalled()
  })
})
