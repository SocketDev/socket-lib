/**
 * @file The browser retry variant.
 *   A browser main thread cannot block, so this variant reports that it cannot
 *   wait and the shared policy makes one attempt. The rule it protects: a
 *   retry never runs without pacing, because an unpaced retry is a hot loop
 *   against whatever already failed.
 */

import { describe, expect, it } from 'vitest'

import {
  canSleepSync,
  runWithSpawnRetry,
  sleepSync,
} from '../../src/process/spawn/retry/browser.mjs'
import {
  isTransientSpawnFailure,
  totalSpawnAttempts,
} from '../../src/process/spawn/retry/policy.mjs'

describe('browser retry variant', () => {
  it('reports that it cannot wait', () => {
    expect(canSleepSync()).toBe(false)
    expect(sleepSync(50)).toBe(false)
  })

  it('returns immediately rather than spinning', () => {
    // A Date.now() spin would block here. It must not.
    const started = Date.now()
    sleepSync(500)
    expect(Date.now() - started).toBeLessThan(100)
  })

  it('makes one attempt even when retries are requested', () => {
    let runs = 0
    const result = runWithSpawnRetry(
      () => {
        runs += 1
        return { signal: 'SIGTERM' }
      },
      { retries: 3 },
    )
    expect(runs).toBe(1)
    expect(result.signal).toBe('SIGTERM')
  })

  it('still returns a success on the first attempt', () => {
    let runs = 0
    const result = runWithSpawnRetry(
      () => {
        runs += 1
        return { status: 0 }
      },
      { retries: 3 },
    )
    expect(runs).toBe(1)
    expect(result.status).toBe(0)
  })

  it('re-exports the shared policy so callers need one import', () => {
    expect(totalSpawnAttempts({ retries: 2 })).toBe(3)
    expect(isTransientSpawnFailure({ signal: 'SIGKILL' })).toBe(true)
  })
})
