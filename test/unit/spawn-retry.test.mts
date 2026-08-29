/**
 * @file Specs for the spawn retry policy.
 *   The load-bearing decision is what does NOT retry. A clean non-zero exit is
 *   the command answering, and a command that changes state may have already
 *   succeeded when the attempt failed. Both cases must make exactly one
 *   attempt unless the caller says otherwise.
 */

import { describe, expect, it } from 'vitest'

import {
  canSleepSync,
  firstRetryDelayMs,
  isTransientSpawnFailure,
  nextRetryDelayMs,
  shouldRetrySpawn,
  sleepSync,
  totalSpawnAttempts,
} from '../../src/process/spawn/retry/node.mjs'

describe('isTransientSpawnFailure', () => {
  it('retries a child killed by a signal', () => {
    // A `timeout` kill lands as a signal, and the command never answered.
    expect(isTransientSpawnFailure({ signal: 'SIGTERM' })).toBe(true)
  })

  it('retries a failed launch', () => {
    expect(isTransientSpawnFailure({ error: new Error('ENOENT') })).toBe(true)
  })

  it('does not retry a clean non-zero exit', () => {
    // No auth, no such package, a failing test. The answer does not change.
    expect(isTransientSpawnFailure({ status: 1 })).toBe(false)
    expect(isTransientSpawnFailure({ signal: undefined, status: 128 })).toBe(
      false,
    )
  })

  it('treats an absent field as no failure', () => {
    // Node reports no signal on a normal exit.
    expect(
      isTransientSpawnFailure({ error: undefined, signal: undefined }),
    ).toBe(false)
  })
})

describe('totalSpawnAttempts', () => {
  it('defaults to a single attempt, so retry is opt-in', () => {
    expect(totalSpawnAttempts()).toBe(1)
    expect(totalSpawnAttempts({})).toBe(1)
  })

  it('counts the first attempt plus the retries', () => {
    expect(totalSpawnAttempts({ retries: 2 })).toBe(3)
  })

  it('collapses a nonsense retries value to one attempt', () => {
    expect(totalSpawnAttempts({ retries: -5 })).toBe(1)
    expect(totalSpawnAttempts({ retries: Number.NaN })).toBe(1)
    expect(totalSpawnAttempts({ retries: Number.POSITIVE_INFINITY })).toBe(1)
  })

  it('floors a fractional retries value', () => {
    expect(totalSpawnAttempts({ retries: 2.9 })).toBe(3)
  })
})

describe('shouldRetrySpawn', () => {
  it('refuses when retries are not requested', () => {
    expect(shouldRetrySpawn({ signal: 'SIGTERM' }, 1)).toBe(false)
  })

  it('retries a transient failure inside the budget', () => {
    expect(shouldRetrySpawn({ signal: 'SIGTERM' }, 1, { retries: 2 })).toBe(
      true,
    )
  })

  it('stops on the final attempt', () => {
    expect(shouldRetrySpawn({ signal: 'SIGTERM' }, 3, { retries: 2 })).toBe(
      false,
    )
  })

  it('refuses a clean non-zero exit even with retries left', () => {
    expect(shouldRetrySpawn({ status: 1 }, 1, { retries: 5 })).toBe(false)
  })

  it('honors a caller predicate', () => {
    // A caller that knows its command is idempotent can widen the rule.
    const isRetryable = () => true
    expect(
      shouldRetrySpawn({ status: 1 }, 1, { isRetryable, retries: 1 }),
    ).toBe(true)
  })
})

describe('delays', () => {
  it('starts at one second and doubles', () => {
    // Spelled out rather than compared against the constants they come from,
    // which would assert only that a value equals itself.
    expect(firstRetryDelayMs()).toBe(1000)
    expect(nextRetryDelayMs(1000)).toBe(2000)
    expect(nextRetryDelayMs(2000)).toBe(4000)
  })

  it('never exceeds the ceiling', () => {
    expect(nextRetryDelayMs(30_000)).toBe(30_000)
    expect(nextRetryDelayMs(1000, { retryMaxDelayMs: 1500 })).toBe(1500)
  })

  it('clamps a first delay above the ceiling', () => {
    expect(
      firstRetryDelayMs({ retryDelayMs: 99_000, retryMaxDelayMs: 5000 }),
    ).toBe(5000)
  })

  it('honors a caller factor', () => {
    expect(nextRetryDelayMs(100, { retryFactor: 3 })).toBe(300)
  })
})

describe('sleepSync', () => {
  it('reports that it waited', () => {
    // Node always defines SharedArrayBuffer, so this is the real path.
    expect(canSleepSync()).toBe(true)
    expect(sleepSync(1)).toBe(true)
  })

  it('accepts a non-positive delay without waiting', () => {
    expect(sleepSync(0)).toBe(true)
    expect(sleepSync(-1)).toBe(true)
  })

  it('actually blocks for roughly the requested time', () => {
    const started = Date.now()
    sleepSync(60)
    expect(Date.now() - started).toBeGreaterThanOrEqual(40)
  })
})
