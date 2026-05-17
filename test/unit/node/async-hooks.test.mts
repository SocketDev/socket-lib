/**
 * @fileoverview Unit tests for src/node/async-hooks.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeAsyncHooks } from '@socketsecurity/lib/node/async-hooks'

describe('node/async-hooks', () => {
  it('returns the node:async_hooks module', () => {
    const ah = getNodeAsyncHooks()
    expect(typeof ah.AsyncLocalStorage).toBe('function')
    expect(typeof ah.executionAsyncId).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeAsyncHooks()).toBe(getNodeAsyncHooks())
  })

  it('does not throw', () => {
    expect(() => getNodeAsyncHooks()).not.toThrow()
  })
})
