/**
 * @file Tests for github/rate-limit-wait - the reset-aware wait planner.
 *   Asserted through the PURE planner rather than the sleeping wrapper, and
 *   every case passes an explicit `now`. A test that let the planner read the
 *   real clock would drift against a fixed reset timestamp and fail an hour
 *   later, and a suite that could only drive the wrapper would have to sleep
 *   for the cap to cover the branch that matters most.
 *   The claim under test is that this is NOT exponential backoff: the wait
 *   comes from what GitHub stated, an hour-scale window is refused rather than
 *   slept through, and refusing is reported as a value the caller acts on
 *   instead of an error.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_RATE_LIMIT_WAIT_MS,
  getGitHubRateLimitWaitMs,
  waitForGitHubRateLimitReset,
} from '../../../src/github/rate-limit-wait.mjs'

import type { GitHubRateLimitSnapshot } from '../../../src/github/rate-limit.mjs'

// A fixed clock. Reset is 120s after NOW.
const NOW_MS = 1_700_000_000_000
const NOW_SECONDS = NOW_MS / 1000
const RESET_EPOCH = NOW_SECONDS + 120

function snapshot(
  overrides?: Partial<GitHubRateLimitSnapshot> | undefined,
): GitHubRateLimitSnapshot {
  return {
    limit: 5000,
    remaining: 4900,
    resetEpochSeconds: RESET_EPOCH,
    resource: 'core',
    used: 100,
    ...overrides,
  }
}

describe('getGitHubRateLimitWaitMs', () => {
  it('plans the wait a response explicitly stated', () => {
    expect(getGitHubRateLimitWaitMs({ now: NOW_MS, waitSeconds: 30 })).toBe(
      30_000,
    )
  })

  it('falls back to the window reset in the ledger', () => {
    expect(
      getGitHubRateLimitWaitMs({
        maxWaitMs: 600_000,
        now: NOW_MS,
        snapshot: snapshot(),
      }),
    ).toBe(120_000)
  })

  it('prefers an explicit waitSeconds over the reset header', () => {
    // A secondary limit sends Retry-After, which no budget header carries, and
    // it is the authority because it came from the refused response.
    expect(
      getGitHubRateLimitWaitMs({
        now: NOW_MS,
        snapshot: snapshot(),
        waitSeconds: 5,
      }),
    ).toBe(5000)
  })

  it('declines when the wait exceeds the cap', () => {
    // The case blind exponential backoff gets wrong: an hourly window is not
    // waitable, so the caller must be told to fail instead of sleeping.
    expect(
      getGitHubRateLimitWaitMs({ maxWaitMs: 60_000, waitSeconds: 3600 }),
    ).toBe(undefined)
  })

  it('declines when the window has already reset', () => {
    expect(
      getGitHubRateLimitWaitMs({
        now: NOW_MS,
        snapshot: snapshot({ resetEpochSeconds: NOW_SECONDS - 10 }),
      }),
    ).toBe(undefined)
  })

  it('declines when nothing said when the window resets', () => {
    expect(
      getGitHubRateLimitWaitMs({
        now: NOW_MS,
        snapshot: snapshot({ resetEpochSeconds: undefined }),
      }),
    ).toBe(undefined)
  })

  it('declines when the caller allows no wait at all', () => {
    expect(getGitHubRateLimitWaitMs({ maxWaitMs: 0, waitSeconds: 1 })).toBe(
      undefined,
    )
  })

  it('caps a default wait at one minute', () => {
    expect(DEFAULT_MAX_RATE_LIMIT_WAIT_MS).toBe(60_000)
    expect(getGitHubRateLimitWaitMs({ waitSeconds: 61 })).toBe(undefined)
    expect(getGitHubRateLimitWaitMs({ waitSeconds: 60 })).toBe(60_000)
  })
})

describe('waitForGitHubRateLimitReset', () => {
  it('reports 0 when it declines, rather than throwing', async () => {
    // Declining is a decision the caller acts on, not an error.
    expect(await waitForGitHubRateLimitReset({ waitSeconds: 3600 })).toBe(0)
  })

  it('sleeps and reports the wait it took', async () => {
    const before = Date.now()
    expect(await waitForGitHubRateLimitReset({ waitSeconds: 0.01 })).toBe(10)
    expect(Date.now() - before).toBeGreaterThanOrEqual(5)
  })
})
