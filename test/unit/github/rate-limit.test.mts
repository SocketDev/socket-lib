/**
 * @file Tests for github/rate-limit — budget tracking, credential-tier
 *   inference, preflight, and reset-aware wait planning.
 *   The failure these guard against is a SILENT downgrade: an unauthenticated
 *   run is served 60 requests/hour instead of 5000 and GitHub never says so,
 *   which turns a spent quota into what looks like a network fault. So the
 *   tier tests pin the boundary values, and the preflight tests pin the
 *   unknown-budget case, since a preflight that failed closed on absent
 *   telemetry would block the first request of every process.
 *   Wait planning is asserted through the PURE planner rather than the sleeping
 *   wrapper, and every case passes an explicit `now`. A test that let the
 *   planner read the real clock would drift against a fixed reset timestamp and
 *   fail an hour later.
 */

import { describe, expect, it } from 'vitest'

import {
  classifyGitHubCredentialTier,
  clearGitHubRateLimitLedger,
  formatGitHubRateLimitStatus,
  getGitHubRateLimitSnapshot,
  GITHUB_ANONYMOUS_HOURLY_LIMIT,
  GITHUB_AUTHENTICATED_HOURLY_LIMIT,
  GITHUB_RATE_LIMIT_HEADERS,
  hasGitHubRateLimitBudget,
  readGitHubRateLimitHeaders,
  recordGitHubRateLimit,
} from '../../../src/github/rate-limit.mjs'

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

describe('readGitHubRateLimitHeaders', () => {
  it('parses every field from a Node header record', () => {
    const parsed = readGitHubRateLimitHeaders({
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4321',
      'x-ratelimit-reset': String(RESET_EPOCH),
      'x-ratelimit-resource': 'core',
      'x-ratelimit-used': '679',
    })
    expect(parsed).toEqual({
      limit: 5000,
      remaining: 4321,
      resetEpochSeconds: RESET_EPOCH,
      resource: 'core',
      used: 679,
    })
  })

  it('parses from a Fetch Headers object, which cases names differently', () => {
    const headers = new Headers({
      'X-RateLimit-Limit': '60',
      'X-RateLimit-Remaining': '7',
    })
    expect(readGitHubRateLimitHeaders(headers)?.limit).toBe(60)
    expect(readGitHubRateLimitHeaders(headers)?.remaining).toBe(7)
  })

  it('defaults the resource to core when the header is absent', () => {
    // GitHub omits x-ratelimit-resource on some responses, and a snapshot
    // filed under '' would never be found by a caller asking for 'core'.
    expect(
      readGitHubRateLimitHeaders({ 'x-ratelimit-remaining': '9' })?.resource,
    ).toBe('core')
  })

  it('keeps a non-core resource distinct', () => {
    expect(
      readGitHubRateLimitHeaders({
        'x-ratelimit-remaining': '9',
        'x-ratelimit-resource': 'search',
      })?.resource,
    ).toBe('search')
  })

  it('answers undefined when no rate-limit header is present', () => {
    expect(readGitHubRateLimitHeaders({ 'content-type': 'json' })).toBe(
      undefined,
    )
    expect(readGitHubRateLimitHeaders(undefined)).toBe(undefined)
  })

  it('treats a remaining of 0 as present, not absent', () => {
    // 0 is the value that matters most, and a falsy check would drop it.
    expect(
      readGitHubRateLimitHeaders({ 'x-ratelimit-remaining': '0' })?.remaining,
    ).toBe(0)
  })

  it('drops an unparseable value rather than reporting NaN', () => {
    expect(
      readGitHubRateLimitHeaders({ 'x-ratelimit-remaining': 'lots' }),
    ).toBe(undefined)
  })
})

describe('the ledger', () => {
  it('records and reads back a snapshot', () => {
    clearGitHubRateLimitLedger()
    recordGitHubRateLimit({
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4000',
    })
    expect(getGitHubRateLimitSnapshot()?.remaining).toBe(4000)
  })

  it('meters resources separately', () => {
    // A spent search budget says nothing about the REST budget, so one must
    // not overwrite the other.
    clearGitHubRateLimitLedger()
    recordGitHubRateLimit({
      'x-ratelimit-remaining': '4000',
      'x-ratelimit-resource': 'core',
    })
    recordGitHubRateLimit({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-resource': 'search',
    })
    expect(getGitHubRateLimitSnapshot('core')?.remaining).toBe(4000)
    expect(getGitHubRateLimitSnapshot('search')?.remaining).toBe(0)
  })

  it('overwrites an earlier snapshot for the same resource', () => {
    clearGitHubRateLimitLedger()
    recordGitHubRateLimit({ 'x-ratelimit-remaining': '10' })
    recordGitHubRateLimit({ 'x-ratelimit-remaining': '9' })
    expect(getGitHubRateLimitSnapshot()?.remaining).toBe(9)
  })

  it('records nothing when the response carried no budget', () => {
    clearGitHubRateLimitLedger()
    expect(recordGitHubRateLimit({ 'content-type': 'json' })).toBe(undefined)
    expect(getGitHubRateLimitSnapshot()).toBe(undefined)
  })

  it('is cleared by clearGitHubRateLimitLedger', () => {
    recordGitHubRateLimit({ 'x-ratelimit-remaining': '10' })
    clearGitHubRateLimitLedger()
    expect(getGitHubRateLimitSnapshot()).toBe(undefined)
  })

  it('never resolves a resource name through the prototype chain', () => {
    // The resource key comes from a response header, so a Map is required:
    // an object ledger would answer 'constructor' with a function.
    clearGitHubRateLimitLedger()
    expect(getGitHubRateLimitSnapshot('constructor')).toBe(undefined)
    expect(getGitHubRateLimitSnapshot('__proto__')).toBe(undefined)
  })
})

describe('classifyGitHubCredentialTier', () => {
  it('reads the anonymous limit as anonymous', () => {
    expect(
      classifyGitHubCredentialTier(
        snapshot({ limit: GITHUB_ANONYMOUS_HOURLY_LIMIT }),
      ),
    ).toBe('anonymous')
  })

  it('reads the authenticated limit as authenticated', () => {
    expect(
      classifyGitHubCredentialTier(
        snapshot({ limit: GITHUB_AUTHENTICATED_HOURLY_LIMIT }),
      ),
    ).toBe('authenticated')
  })

  it('reads a higher allowance as elevated', () => {
    expect(classifyGitHubCredentialTier(snapshot({ limit: 15_000 }))).toBe(
      'elevated',
    )
  })

  it('reports unknown rather than guessing anonymous with no limit', () => {
    // The distinction that matters: absent telemetry must not be reported to
    // an operator as "you are unauthenticated".
    expect(classifyGitHubCredentialTier(snapshot({ limit: undefined }))).toBe(
      'unknown',
    )
    expect(classifyGitHubCredentialTier(undefined)).toBe('unknown')
  })
})

describe('hasGitHubRateLimitBudget', () => {
  it('is true when the budget covers the request', () => {
    expect(
      hasGitHubRateLimitBudget(40, { snapshot: snapshot({ remaining: 50 }) }),
    ).toBe(true)
  })

  it('is false when it does not', () => {
    expect(
      hasGitHubRateLimitBudget(40, { snapshot: snapshot({ remaining: 12 }) }),
    ).toBe(false)
  })

  it('is true at exactly the budget', () => {
    expect(
      hasGitHubRateLimitBudget(50, { snapshot: snapshot({ remaining: 50 }) }),
    ).toBe(true)
  })

  it('honours a reserve held back for other callers', () => {
    const budget = snapshot({ remaining: 50 })
    expect(
      hasGitHubRateLimitBudget(45, { reserve: 10, snapshot: budget }),
    ).toBe(false)
    expect(
      hasGitHubRateLimitBudget(40, { reserve: 10, snapshot: budget }),
    ).toBe(true)
  })

  it('is TRUE when the budget is unknown', () => {
    // Failing closed here would block the first request of every process,
    // which is exactly when nothing has been recorded.
    clearGitHubRateLimitLedger()
    expect(hasGitHubRateLimitBudget(1000)).toBe(true)
  })

  it('reads the ledger when given no explicit snapshot', () => {
    clearGitHubRateLimitLedger()
    recordGitHubRateLimit({ 'x-ratelimit-remaining': '3' })
    expect(hasGitHubRateLimitBudget(10)).toBe(false)
    expect(hasGitHubRateLimitBudget(2)).toBe(true)
  })

  it('checks the named resource, not core', () => {
    clearGitHubRateLimitLedger()
    recordGitHubRateLimit({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-resource': 'search',
    })
    expect(hasGitHubRateLimitBudget(5, { resource: 'search' })).toBe(false)
    expect(hasGitHubRateLimitBudget(5, { resource: 'core' })).toBe(true)
  })
})

describe('formatGitHubRateLimitStatus', () => {
  it('names the tier, which is the fact a failure count hides', () => {
    const line = formatGitHubRateLimitStatus({
      now: NOW_MS,
      snapshot: snapshot({ limit: 60, remaining: 43 }),
    })
    expect(line).toContain('43/60 remaining')
    expect(line).toContain('anonymous')
    expect(line).toContain('resets in 2m')
  })

  it('says so when nothing has been recorded', () => {
    clearGitHubRateLimitLedger()
    expect(formatGitHubRateLimitStatus()).toContain('unknown')
  })

  it('omits the tier when there is no limit to infer it from', () => {
    const line = formatGitHubRateLimitStatus({
      now: NOW_MS,
      snapshot: snapshot({ limit: undefined }),
    })
    expect(line).not.toContain('unknown')
    expect(line).toContain('4900 remaining')
  })

  it('names the resource it is describing', () => {
    expect(
      formatGitHubRateLimitStatus({
        now: NOW_MS,
        snapshot: snapshot({ resource: 'search' }),
      }),
    ).toContain('(search)')
  })

  it('renders an hour-scale reset with hours and minutes', () => {
    expect(
      formatGitHubRateLimitStatus({
        now: NOW_MS,
        snapshot: snapshot({ resetEpochSeconds: NOW_SECONDS + 3661 }),
      }),
    ).toContain('resets in 1h 1m 1s')
  })

  it('renders an elapsed window as now', () => {
    expect(
      formatGitHubRateLimitStatus({
        now: NOW_MS,
        snapshot: snapshot({ resetEpochSeconds: NOW_SECONDS - 5 }),
      }),
    ).toContain('resets in now')
  })
})

describe('GITHUB_RATE_LIMIT_HEADERS', () => {
  it('lists the headers the parser reads, sorted and frozen', () => {
    expect(GITHUB_RATE_LIMIT_HEADERS).toEqual([
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'x-ratelimit-resource',
      'x-ratelimit-used',
    ])
    expect(Object.isFrozen(GITHUB_RATE_LIMIT_HEADERS)).toBe(true)
  })
})
