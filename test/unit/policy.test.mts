/**
 * @file The shared retry policy, which both platform variants re-export.
 *   Kept apart from the variant specs so the decisions are covered once
 *   rather than twice with a platform sleeper bolted on.
 */

import { describe, expect, it } from 'vitest'

import {
  isTransientSpawnFailure,
  totalSpawnAttempts,
} from '../../src/process/spawn/retry/policy.mjs'

describe('shared retry policy', () => {
  it('counts the first attempt plus the retries', () => {
    expect(totalSpawnAttempts({ retries: 2 })).toBe(3)
  })

  it('retries only a failure that never reached a verdict', () => {
    expect(isTransientSpawnFailure({ signal: 'SIGKILL' })).toBe(true)
    expect(isTransientSpawnFailure({ status: 1 })).toBe(false)
  })
})
