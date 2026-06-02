/**
 * @file Unit tests for src/promises/timers.ts
 */

import { describe, expect, it } from 'vitest'

import { sleep, yieldToEventLoop } from '../../../src/promises/timers'

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    const before = Date.now()
    await sleep(20)
    // Allow generous headroom for slow CI; just verify it waited at least 10ms.
    expect(Date.now() - before).toBeGreaterThanOrEqual(10)
  })

  it('resolves immediately for 0 ms', async () => {
    const before = Date.now()
    await sleep(0)
    expect(Date.now() - before).toBeLessThan(50)
  })

  it('clamps negative values to 0', async () => {
    const before = Date.now()
    await sleep(-100)
    expect(Date.now() - before).toBeLessThan(50)
  })

  it('returns a Promise', () => {
    const result = sleep(0)
    expect(result).toBeInstanceOf(Promise)
    return result
  })

  it('resolves to undefined', async () => {
    expect(await sleep(0)).toBeUndefined()
  })
})

describe('yieldToEventLoop', () => {
  it('resolves quickly', async () => {
    const before = Date.now()
    await yieldToEventLoop()
    expect(Date.now() - before).toBeLessThan(50)
  })

  it('returns a Promise that resolves to undefined', async () => {
    const result = yieldToEventLoop()
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toBeUndefined()
  })

  it('flushes the microtask queue', async () => {
    const order: number[] = []
    void Promise.resolve().then(() => order.push(1))
    await yieldToEventLoop()
    order.push(2)
    expect(order).toEqual([1, 2])
  })
})
