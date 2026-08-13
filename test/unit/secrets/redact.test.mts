/**
 * @file Unit tests for src/secrets/redact.ts. Secret-shaped fixtures are
 *   constructed at runtime (prefix + repeat) so no literal token shape ever
 *   sits in the repo for a scanner to flag.
 */

import { describe, expect, it } from 'vitest'

import { redactContext } from '../../../src/secrets/redact'

// Literal copies of the markers src/secrets/redact.ts exports. Written out
// here (instead of imported) so the expected values are independent of the
// system under test — and so the marker strings themselves are locked.
const REDACTED = '[redacted]'
const OMITTED = '[omitted]'

describe('redactContext', () => {
  it('redacts exact credential key names whatever they hold', () => {
    expect(
      redactContext({ count: 2, password: 'hunter2', token: 'opaque' }),
    ).toEqual({ count: 2, password: REDACTED, token: REDACTED })
  })

  it('matches exact key names case-insensitively', () => {
    expect(redactContext({ Token: 'x' })).toEqual({ Token: REDACTED })
  })

  it('leaves keys that merely contain a credential word intact', () => {
    expect(
      redactContext({ stagedPublishingEnabled: true, tokenCount: 3 }),
    ).toEqual({ stagedPublishingEnabled: true, tokenCount: 3 })
  })

  it('redacts substring-matched credential-marker key names', () => {
    expect(
      redactContext({ _csrf: 'a', csrfToken: 'b', linkStateValue: 'c' }),
    ).toEqual({
      _csrf: REDACTED,
      csrfToken: REDACTED,
      linkStateValue: REDACTED,
    })
  })

  it('redacts a string VALUE matching a known token shape under any key', () => {
    const fake = `sktsec_${'a'.repeat(24)}`
    expect(redactContext({ unexpectedField: fake })).toEqual({
      unexpectedField: REDACTED,
    })
    expect(redactContext([fake, 'safe'])).toEqual([REDACTED, 'safe'])
  })

  it('omits bulky no-audit-value keys', () => {
    expect(
      redactContext({ avatars: { large: 'url' }, chunks: ['alpha.js'] }),
    ).toEqual({ avatars: OMITTED, chunks: OMITTED })
  })

  it('leaves non-secret primitives alone', () => {
    expect(redactContext('plain')).toBe('plain')
    expect(redactContext(42)).toBe(42)
    // JSON is where a real null reaches this walk; parsing one covers the
    // null branch without a banned null literal.
    expect(redactContext(JSON.parse('null'))).toBeNull()
    expect(redactContext(undefined)).toBeUndefined()
    expect(redactContext(true)).toBe(true)
  })

  it('walks nested objects and arrays', () => {
    expect(
      redactContext({
        list: [{ secret: 's' }, { ok: 1 }],
        nested: { token: 't' },
      }),
    ).toEqual({
      list: [{ secret: REDACTED }, { ok: 1 }],
      nested: { token: REDACTED },
    })
  })

  it('replaces a cycle with the omitted marker instead of recursing', () => {
    const cyclic: Record<string, unknown> = { name: 'root' }
    cyclic['self'] = cyclic
    expect(redactContext(cyclic)).toEqual({ name: 'root', self: OMITTED })
  })

  it('keeps the same object appearing twice as siblings', () => {
    const shared = { ok: 1 }
    expect(redactContext({ a: shared, b: shared })).toEqual({
      a: { ok: 1 },
      b: { ok: 1 },
    })
  })

  it('caps pathological nesting with the omitted marker', () => {
    let deep: unknown = 'leaf'
    for (let i = 0; i < 20; i += 1) {
      deep = { next: deep }
    }
    let cursor = redactContext(deep) as Record<string, unknown>
    let depth = 0
    while (typeof cursor === 'object' && cursor !== null) {
      cursor = cursor['next'] as Record<string, unknown>
      depth += 1
    }
    expect(cursor as unknown).toBe(OMITTED)
    expect(depth).toBeLessThan(20)
  })

  it('returns a copy, leaving the input untouched', () => {
    const input = { token: 'live' }
    const out = redactContext(input)
    expect(out).not.toBe(input)
    expect(input.token).toBe('live')
  })
})
