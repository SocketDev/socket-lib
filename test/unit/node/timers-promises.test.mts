/**
 * @fileoverview Unit tests for src/node/timers-promises.ts.
 */

import { describe, expect, it } from 'vitest'

import { getNodeTimersPromises } from '@socketsecurity/lib/node/timers-promises'

describe('node/timers-promises', () => {
  it('returns the node:timers/promises module', () => {
    const tp = getNodeTimersPromises()
    expect(typeof tp.setTimeout).toBe('function')
    expect(typeof tp.setImmediate).toBe('function')
  })

  it('is idempotent across repeated calls', () => {
    expect(getNodeTimersPromises()).toBe(getNodeTimersPromises())
  })

  it('does not throw', () => {
    expect(() => getNodeTimersPromises()).not.toThrow()
  })

  it('setTimeout actually delays', async () => {
    const tp = getNodeTimersPromises()
    const start = performance.now()
    await tp.setTimeout(10)
    const elapsed = performance.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(8)
  })
})
