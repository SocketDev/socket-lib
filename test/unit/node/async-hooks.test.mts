/**
 * @file Unit tests for src/node/async-hooks.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeAsyncHooks } from '../../../src/node/async-hooks'

describe('node/async-hooks', () => {
  it('returns the node:async_hooks module', () => {
    const ah = getNodeAsyncHooks()
    expect(typeof ah.AsyncLocalStorage).toBe('function')
    expect(typeof ah.executionAsyncId).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    const first = getNodeAsyncHooks()
    const second = getNodeAsyncHooks()
    expect(first).toBe(second)
  })

  it('does not throw', () => {
    let thrown: unknown
    try {
      getNodeAsyncHooks()
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeUndefined()
  })
})
