/**
 * @file Unit tests for src/promises/backoff.ts
 */

import { describe, expect, it } from 'vitest'

import { createBackoff } from '../../../src/promises/backoff'

function recordingSleeper(): {
  sleeper: (ms: number) => Promise<void>
  waits: number[]
} {
  const waits: number[] = []
  return {
    sleeper(ms: number) {
      waits.push(ms)
      return Promise.resolve()
    },
    waits,
  }
}

describe('createBackoff', () => {
  it('starts at the initial delay', () => {
    const backoff = createBackoff(100)
    expect(backoff.currentMs()).toBe(100)
  })

  it('doubles the delay after each wait by default', async () => {
    const { sleeper, waits } = recordingSleeper()
    const backoff = createBackoff(100, { sleeper })
    await backoff.wait()
    await backoff.wait()
    await backoff.wait()
    expect(waits).toEqual([100, 200, 400])
    expect(backoff.currentMs()).toBe(800)
  })

  it('sleeps the CURRENT delay, then grows it', async () => {
    const { sleeper, waits } = recordingSleeper()
    const backoff = createBackoff(50, { sleeper })
    await backoff.wait()
    expect(waits).toEqual([50])
    expect(backoff.currentMs()).toBe(100)
  })

  it('applies a custom growth factor', async () => {
    const { sleeper, waits } = recordingSleeper()
    const backoff = createBackoff(10, { factor: 3, sleeper })
    await backoff.wait()
    await backoff.wait()
    expect(waits).toEqual([10, 30])
    expect(backoff.currentMs()).toBe(90)
  })

  it('caps the delay at maxMs', async () => {
    const { sleeper, waits } = recordingSleeper()
    const backoff = createBackoff(100, { maxMs: 250, sleeper })
    await backoff.wait()
    await backoff.wait()
    await backoff.wait()
    await backoff.wait()
    expect(waits).toEqual([100, 200, 250, 250])
    expect(backoff.currentMs()).toBe(250)
  })

  it('resets to the initial delay on forward progress', async () => {
    const { sleeper, waits } = recordingSleeper()
    const backoff = createBackoff(100, { sleeper })
    await backoff.wait()
    await backoff.wait()
    expect(backoff.currentMs()).toBe(400)
    backoff.reset()
    expect(backoff.currentMs()).toBe(100)
    await backoff.wait()
    expect(waits).toEqual([100, 200, 100])
    expect(backoff.currentMs()).toBe(200)
  })

  it('sleeps for real with the default sleeper', async () => {
    const backoff = createBackoff(10)
    const before = Date.now()
    await backoff.wait()
    // Allow generous headroom for slow CI; just verify it waited at least 5ms.
    expect(Date.now() - before).toBeGreaterThanOrEqual(5)
    expect(backoff.currentMs()).toBe(20)
  })
})
