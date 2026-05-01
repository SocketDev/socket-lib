/**
 * @fileoverview Unit tests for crypto helpers.
 *
 * Covers `hash()` and the `getNativeHash()` feature-detect:
 * - one-shot hashing for sha256, sha512 across hex / base64 / base64url
 * - native vs. fallback (createHash().update().digest()) parity
 * - feature-detect tri-state: native present, native missing
 */

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import { getNativeHash, hash } from '@socketsecurity/lib/crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('crypto', () => {
  describe('hash', () => {
    // Reference values produced by `createHash().update().digest()` —
    // the implementation we delegate to when the runtime predates
    // Node's `crypto.hash`. These let us assert byte-for-byte parity
    // independent of which path the export resolved to.

    it('matches createHash for sha256 hex of a string', () => {
      const expected = createHash('sha256').update('hello').digest('hex')
      expect(hash('sha256', 'hello', 'hex')).toBe(expected)
    })

    it('matches createHash for sha512 base64 of a string', () => {
      const expected = createHash('sha512').update('socket').digest('base64')
      expect(hash('sha512', 'socket', 'base64')).toBe(expected)
    })

    it('matches createHash for sha256 base64url of a buffer', () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef])
      const expected = createHash('sha256').update(buf).digest('base64url')
      expect(hash('sha256', buf, 'base64url')).toBe(expected)
    })

    it('matches createHash for sha512 hex of an empty string', () => {
      const expected = createHash('sha512').update('').digest('hex')
      expect(hash('sha512', '', 'hex')).toBe(expected)
    })

    // sha256("hello") is well-known. Pin it so a regression in the
    // helper itself (not just createHash drift) gets flagged.
    it('produces the canonical sha256 hex digest of "hello"', () => {
      expect(hash('sha256', 'hello', 'hex')).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      )
    })

    it('handles a moderately large buffer', () => {
      const buf = Buffer.alloc(1024 * 64, 0x42)
      const expected = createHash('sha512').update(buf).digest('hex')
      expect(hash('sha512', buf, 'hex')).toBe(expected)
    })
  })

  describe('getNativeHash', () => {
    // Exposed for tests; not part of the public API. Returns the
    // native `crypto.hash` when available (Node 21.7+ / 20.12+) or
    // `null` on older runtimes.

    it('returns a function on a runtime with crypto.hash', () => {
      // Node 22+ always has it.
      expect(typeof getNativeHash()).toBe('function')
    })

    it('returns the same value on subsequent calls (memoized)', () => {
      expect(getNativeHash()).toBe(getNativeHash())
    })
  })

  // Explicit coverage of the fallback branch. When `crypto.hash` is
  // unavailable, `hash()` falls back to `createHash().update().digest()`
  // and the result must still match. We delete the property and
  // re-import the module fresh.
  describe('hash — fallback implementation', () => {
    const cryptoMod = require('node:crypto') as {
      hash?: unknown
    }
    const hadNative = typeof cryptoMod.hash === 'function'
    const nativeHash = hadNative ? cryptoMod.hash : undefined

    afterEach(() => {
      if (hadNative && nativeHash !== undefined) {
        cryptoMod.hash = nativeHash
      }
      vi.resetModules()
    })

    async function loadFallback(): Promise<{
      hash: typeof hash
      getNativeHash: typeof getNativeHash
    }> {
      delete cryptoMod.hash
      vi.resetModules()
      const mod = await import('@socketsecurity/lib/crypto')
      return { hash: mod.hash, getNativeHash: mod.getNativeHash }
    }

    it('getNativeHash returns undefined when crypto.hash is missing', async () => {
      const { getNativeHash: gnh } = await loadFallback()
      expect(gnh()).toBeUndefined()
    })

    it('fallback hash() still produces correct sha256 hex', async () => {
      const { hash: h } = await loadFallback()
      const expected = createHash('sha256').update('hello').digest('hex')
      expect(h('sha256', 'hello', 'hex')).toBe(expected)
    })

    it('fallback hash() still produces correct sha512 base64', async () => {
      const { hash: h } = await loadFallback()
      const expected = createHash('sha512').update('socket').digest('base64')
      expect(h('sha512', 'socket', 'base64')).toBe(expected)
    })

    it('fallback handles buffer input', async () => {
      const { hash: h } = await loadFallback()
      const buf = Buffer.from([1, 2, 3, 4, 5])
      const expected = createHash('sha256').update(buf).digest('hex')
      expect(h('sha256', buf, 'hex')).toBe(expected)
    })

    it('fallback memoizes the missing-native result', async () => {
      const { getNativeHash: gnh } = await loadFallback()
      expect(gnh()).toBeUndefined()
      expect(gnh()).toBeUndefined()
    })
  })
})
