/**
 * @file Tests for github/error-classification — the pure classifier that turns
 *   a GitHub status + headers + body into a blocking-condition verdict.
 *   The bug this guards against: a GitHub 403 carrying
 *   `x-ratelimit-remaining: 0` has no distinguishing status code, so a caller
 *   that reads the body without checking the status reads a throttled response
 *   as "this repo has nothing to return" and reports a silent success. Every
 *   detector below is asserted from BOTH header shapes the classifier accepts,
 *   because a Fetch `Headers` and a Node header record disagree about key
 *   casing and about array values.
 */

import { describe, expect, it } from 'vitest'

import {
  classifyGitHubErrorResponse,
  getGitHubRateLimitWaitSeconds,
  getGitHubResponseHeader,
  GITHUB_BLOCKING_ERROR_KINDS,
} from '../../../src/github/error-classification.ts'

const RATE_LIMIT_BODY = '{"message":"API rate limit exceeded for user 123."}'
const SECONDARY_LIMIT_BODY =
  '{"message":"You have exceeded a secondary rate limit."}'
// A body that says nothing about throttling, so a test using it proves the
// HEADER detector fired rather than the body one. Without this the two
// detectors cover for each other and deleting either leaves the suite green.
const SILENT_BODY = '{"message":"Forbidden"}'

describe('classifyGitHubErrorResponse', () => {
  it('reads a 403 with x-ratelimit-remaining: 0 as a rate limit', () => {
    const result = classifyGitHubErrorResponse({
      body: SILENT_BODY,
      headers: new Headers({ 'x-ratelimit-remaining': '0' }),
      status: 403,
    })
    expect(result?.kind).toBe('rate-limit')
    expect(result?.retryable).toBe(true)
  })

  it('reads a 403 with x-ratelimit-remaining: 0 as a rate limit from a header record', () => {
    const result = classifyGitHubErrorResponse({
      body: SILENT_BODY,
      headers: { 'X-RateLimit-Remaining': '0' },
      status: 403,
    })
    expect(result?.kind).toBe('rate-limit')
  })

  it('reads a 429 as a rate limit even with no body', () => {
    expect(classifyGitHubErrorResponse({ status: 429 })?.kind).toBe(
      'rate-limit',
    )
  })

  it('reads a 403 whose body mentions a rate limit as a rate limit', () => {
    const result = classifyGitHubErrorResponse({
      body: RATE_LIMIT_BODY,
      headers: new Headers(),
      status: 403,
    })
    expect(result?.kind).toBe('rate-limit')
  })

  it('reads a 403 secondary rate limit as abuse detection', () => {
    const result = classifyGitHubErrorResponse({
      body: SECONDARY_LIMIT_BODY,
      headers: new Headers(),
      status: 403,
    })
    expect(result?.kind).toBe('abuse-detection')
    expect(result?.retryable).toBe(true)
  })

  it('reads a 403 abuse-detection body as abuse detection', () => {
    const result = classifyGitHubErrorResponse({
      body: '{"message":"triggered abuse detection"}',
      status: 403,
    })
    expect(result?.kind).toBe('abuse-detection')
  })

  it('prefers abuse detection over the rate limit when both would match', () => {
    const result = classifyGitHubErrorResponse({
      body: SECONDARY_LIMIT_BODY,
      headers: new Headers({ 'x-ratelimit-remaining': '0' }),
      status: 403,
    })
    expect(result?.kind).toBe('abuse-detection')
  })

  it('reads a 401 as an auth failure that waiting cannot clear', () => {
    const result = classifyGitHubErrorResponse({ status: 401 })
    expect(result?.kind).toBe('auth-failure')
    expect(result?.retryable).toBe(false)
    expect(result?.waitSeconds).toBeUndefined()
  })

  it('carries the reset window on a rate limit', () => {
    const result = classifyGitHubErrorResponse({
      headers: new Headers({ 'retry-after': '42' }),
      status: 429,
    })
    expect(result?.waitSeconds).toBe(42)
  })

  it('returns undefined for a healthy 200', () => {
    expect(
      classifyGitHubErrorResponse({ body: '{}', status: 200 }),
    ).toBeUndefined()
  })

  it('returns undefined for a 404 so the caller keeps its own handling', () => {
    expect(
      classifyGitHubErrorResponse({ body: '{}', status: 404 }),
    ).toBeUndefined()
  })

  it('returns undefined for a 403 permission denial with quota remaining', () => {
    const result = classifyGitHubErrorResponse({
      body: '{"message":"Must have admin rights to Repository."}',
      headers: new Headers({ 'x-ratelimit-remaining': '4999' }),
      status: 403,
    })
    expect(result).toBeUndefined()
  })

  it('returns undefined for a 500 so the caller can treat it as transient', () => {
    expect(classifyGitHubErrorResponse({ status: 503 })).toBeUndefined()
  })
})

describe('getGitHubRateLimitWaitSeconds', () => {
  it('prefers retry-after in seconds', () => {
    expect(
      getGitHubRateLimitWaitSeconds(new Headers({ 'retry-after': '30' })),
    ).toBe(30)
  })

  it('accepts an HTTP-date retry-after', () => {
    const future = new Date(Date.now() + 20_000).toUTCString()
    const seconds = getGitHubRateLimitWaitSeconds({ 'retry-after': future })
    expect(seconds).toBeGreaterThan(10)
    expect(seconds).toBeLessThanOrEqual(20)
  })

  it('falls back to x-ratelimit-reset epoch seconds', () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 25
    const seconds = getGitHubRateLimitWaitSeconds(
      new Headers({ 'x-ratelimit-reset': String(resetEpoch) }),
    )
    expect(seconds).toBeGreaterThan(20)
    expect(seconds).toBeLessThanOrEqual(25)
  })

  it('floors an already-elapsed reset at zero', () => {
    const past = Math.floor(Date.now() / 1000) - 600
    expect(
      getGitHubRateLimitWaitSeconds({ 'x-ratelimit-reset': String(past) }),
    ).toBe(0)
  })

  it('returns undefined when neither header is present', () => {
    expect(getGitHubRateLimitWaitSeconds(new Headers())).toBeUndefined()
  })

  it('returns undefined for absent headers', () => {
    expect(getGitHubRateLimitWaitSeconds(undefined)).toBeUndefined()
  })

  it('returns undefined for a non-numeric x-ratelimit-reset', () => {
    expect(
      getGitHubRateLimitWaitSeconds({ 'x-ratelimit-reset': 'soon' }),
    ).toBeUndefined()
  })
})

describe('getGitHubResponseHeader', () => {
  it('reads from a Fetch Headers object', () => {
    expect(
      getGitHubResponseHeader(
        new Headers({ 'Retry-After': '5' }),
        'retry-after',
      ),
    ).toBe('5')
  })

  it('reads a differently-cased key out of a plain record', () => {
    expect(getGitHubResponseHeader({ 'Retry-After': '5' }, 'retry-after')).toBe(
      '5',
    )
  })

  it('takes the first entry of an array-valued header', () => {
    expect(
      getGitHubResponseHeader({ 'retry-after': ['7', '9'] }, 'retry-after'),
    ).toBe('7')
  })

  it('returns undefined for a missing header', () => {
    expect(getGitHubResponseHeader({}, 'retry-after')).toBeUndefined()
    expect(
      getGitHubResponseHeader(new Headers(), 'retry-after'),
    ).toBeUndefined()
  })

  it('returns undefined for absent headers', () => {
    expect(getGitHubResponseHeader(undefined, 'retry-after')).toBeUndefined()
  })
})

describe('GITHUB_BLOCKING_ERROR_KINDS', () => {
  it('lists every kind the classifier can return', () => {
    expect([...GITHUB_BLOCKING_ERROR_KINDS]).toEqual([
      'abuse-detection',
      'auth-failure',
      'rate-limit',
    ])
  })

  it('is frozen so a caller cannot edit the shared list', () => {
    expect(Object.isFrozen(GITHUB_BLOCKING_ERROR_KINDS)).toBe(true)
  })
})
