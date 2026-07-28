/**
 * @file Tests for releases/github-retry-config — the shared GITHUB_RETRY_CONFIG
 *   and its SOCKET_GITHUB_RETRY_BASE_DELAY_MS env override. The override is
 *   read live via `resolveBaseDelayMs()` (not memoized), so these tests mutate
 *   `process.env` per case rather than re-importing the module. The frozen
 *   GITHUB_RETRY_CONFIG snapshots the delay at load time; we assert its fixed
 *   invariants (backoffFactor / retries / frozen / null proto) separately.
 *   Note: the vitest config sets SOCKET_GITHUB_RETRY_BASE_DELAY_MS=0 globally
 *   so the slow GitHub-API retry tests don't burn real wallclock. Each case
 *   here sets the env explicitly and restores it after.
 */

import process from 'node:process'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_BASE_DELAY_MS as CANONICAL_DEFAULT_BASE_DELAY_MS } from '@socketsecurity/lib-stable/releases/github-retry-config'

import {
  DEFAULT_BASE_DELAY_MS,
  GITHUB_RETRY_CONFIG,
  resolveBaseDelayMs,
} from '../../../src/releases/github-retry-config.ts'

const ENV_KEY = 'SOCKET_GITHUB_RETRY_BASE_DELAY_MS'
let savedEnv: string | undefined

beforeEach(() => {
  savedEnv = process.env[ENV_KEY]
})

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env[ENV_KEY]
  } else {
    process.env[ENV_KEY] = savedEnv
  }
})

function withEnv(value: string | undefined): number {
  if (value === undefined) {
    delete process.env[ENV_KEY]
  } else {
    process.env[ENV_KEY] = value
  }
  return resolveBaseDelayMs()
}

describe('resolveBaseDelayMs', () => {
  it('defaults to 5000 when the env var is unset', () => {
    expect(withEnv(undefined)).toBe(CANONICAL_DEFAULT_BASE_DELAY_MS)
    expect(DEFAULT_BASE_DELAY_MS).toBe(5000)
  })

  it('honors 0 (near-instant retries)', () => {
    expect(withEnv('0')).toBe(0)
  })

  it('honors a custom positive override', () => {
    expect(withEnv('250')).toBe(250)
  })

  it('falls back to 5000 for a non-numeric override', () => {
    expect(withEnv('not-a-number')).toBe(5000)
  })

  it('falls back to 5000 for an empty string', () => {
    expect(withEnv('')).toBe(5000)
  })
})

describe('GITHUB_RETRY_CONFIG', () => {
  it('keeps the fixed backoff + retry policy', () => {
    expect(GITHUB_RETRY_CONFIG.backoffFactor).toBe(2)
    expect(GITHUB_RETRY_CONFIG.retries).toBe(2)
  })

  it('exposes a numeric baseDelayMs', () => {
    expect(typeof GITHUB_RETRY_CONFIG.baseDelayMs).toBe('number')
  })

  it('is frozen (callers must not mutate the shared config)', () => {
    expect(Object.isFrozen(GITHUB_RETRY_CONFIG)).toBe(true)
  })

  it('has a null prototype (no inherited Object members)', () => {
    expect(Object.getPrototypeOf(GITHUB_RETRY_CONFIG)).toBe(null)
  })
})
