/**
 * @file Unit tests for crypto helpers. Covers `hash()`, the `nativeHash()`
 *   feature-detect, and the content-addressed blob helpers:
 *
 *   - one-shot hashing for sha256, sha512 across hex / base64 / base64url
 *   - native vs. fallback (createHash().update().digest()) parity
 *   - feature-detect tri-state: native present, native missing
 *   - blobHashOf (Q + base64url sha256) and verifyBlobHash integrity check
 */

import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

// oxlint-disable-next-line socket/no-src-import-in-test-expect -- nativeHash is the system-under-test for the nativeHash describe block (its feature-detect + memoized identity are what we assert on), not a builder of expected values.
import {
  blobHashOf,
  hash as hashOneShot,
  nativeHash,
  verifyBlobHash,
} from '../../src/crypto/hash'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as HashModule from '../../src/crypto/hash'

describe('crypto', () => {
  describe('hash', () => {
    // Reference values produced by `createHash().update().digest()` —
    // the implementation we delegate to when the runtime predates
    // Node's `crypto.hash`. These let us assert byte-for-byte parity
    // independent of which path the export resolved to.

    it('matches createHash for sha256 hex of a string', () => {
      const expected = crypto.createHash('sha256').update('hello').digest('hex')
      expect(hashOneShot('sha256', 'hello', 'hex')).toBe(expected)
    })

    it('matches createHash for sha512 base64 of a string', () => {
      const expected = crypto
        .createHash('sha512')
        .update('socket')
        .digest('base64')
      expect(hashOneShot('sha512', 'socket', 'base64')).toBe(expected)
    })

    it('matches createHash for sha256 base64url of a buffer', () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef])
      const expected = crypto
        .createHash('sha256')
        .update(buf)
        .digest('base64url')
      expect(hashOneShot('sha256', buf, 'base64url')).toBe(expected)
    })

    it('matches createHash for sha512 hex of an empty string', () => {
      const expected = crypto.createHash('sha512').update('').digest('hex')
      expect(hashOneShot('sha512', '', 'hex')).toBe(expected)
    })

    // sha256("hello") is well-known. Pin it so a regression in the
    // helper itself (not just createHash drift) gets flagged.
    it('produces the canonical sha256 hex digest of "hello"', () => {
      expect(hashOneShot('sha256', 'hello', 'hex')).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      )
    })

    it('handles a moderately large buffer', () => {
      const buf = Buffer.alloc(1024 * 64, 0x42)
      const expected = crypto.createHash('sha512').update(buf).digest('hex')
      expect(hashOneShot('sha512', buf, 'hex')).toBe(expected)
    })
  })

  describe('nativeHash', () => {
    // Exposed for tests; not part of the public API. Returns the
    // native `crypto.hash` when available (Node 21.7+ / 20.12+) or
    // `null` on older runtimes.

    it('returns a function on a runtime with crypto.hash', () => {
      // Node 22+ always has it.
      expect(typeof nativeHash()).toBe('function')
    })

    it('returns the same value on subsequent calls (memoized)', () => {
      expect(nativeHash()).toBe(nativeHash())
    })
  })

  // Explicit coverage of the fallback branch. When `crypto.hash` is
  // unavailable, `hash()` falls back to `createHash().update().digest()`
  // and the result must still match. We delete the property and
  // re-import the module fresh.
  describe('hash — fallback implementation', () => {
    const cryptoMod = require('node:crypto') as {
      // oxlint-disable-next-line socket/no-bare-crypto-named-usage -- type-literal key models node:crypto's deletable `hash` property; accessed only via dotted `cryptoMod.hash`.
      hash?: unknown | undefined
    }
    const hadNative = typeof cryptoMod.hash === 'function'
    const savedNativeHash = hadNative ? cryptoMod.hash : undefined

    afterEach(() => {
      if (hadNative && savedNativeHash !== undefined) {
        cryptoMod.hash = savedNativeHash
      }
      vi.resetModules()
    })

    async function loadFallback(): Promise<
      Pick<typeof HashModule, 'hash' | 'nativeHash'>
    > {
      delete cryptoMod.hash
      vi.resetModules()
      // oxlint-disable-next-line socket/no-dynamic-import-outside-bundle -- re-import after vi.resetModules to exercise the native-hash fallback.
      const mod = await import('../../src/crypto/hash')
      return { hash: mod.hash, nativeHash: mod.nativeHash }
    }

    it('nativeHash returns undefined when crypto.hash is missing', async () => {
      const { nativeHash: gnh } = await loadFallback()
      expect(gnh()).toBeUndefined()
    })

    it('fallback hash() still produces correct sha256 hex', async () => {
      const { hash: h } = await loadFallback()
      const expected = crypto.createHash('sha256').update('hello').digest('hex')
      expect(h('sha256', 'hello', 'hex')).toBe(expected)
    })

    it('fallback hash() still produces correct sha512 base64', async () => {
      const { hash: h } = await loadFallback()
      const expected = crypto
        .createHash('sha512')
        .update('socket')
        .digest('base64')
      expect(h('sha512', 'socket', 'base64')).toBe(expected)
    })

    it('fallback handles buffer input', async () => {
      const { hash: h } = await loadFallback()
      const buf = Buffer.from([1, 2, 3, 4, 5])
      const expected = crypto.createHash('sha256').update(buf).digest('hex')
      expect(h('sha256', buf, 'hex')).toBe(expected)
    })

    it('fallback memoizes the missing-native result', async () => {
      const { nativeHash: gnh } = await loadFallback()
      expect(gnh()).toBeUndefined()
      expect(gnh()).toBeUndefined()
    })
  })

  describe('blobHashOf', () => {
    it('computes Q + base64url(sha256(bytes))', () => {
      const bytes = new TextEncoder().encode('hello')
      const expected =
        'Q' + crypto.createHash('sha256').update(bytes).digest('base64url')
      expect(blobHashOf(bytes)).toBe(expected)
      // Stable, prefix-tagged value.
      expect(blobHashOf(bytes)).toBe(
        'QLPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ',
      )
    })

    it('hashes empty input to the sha256-of-empty address', () => {
      const expected =
        'Q' + crypto.createHash('sha256').update('').digest('base64url')
      expect(blobHashOf(new Uint8Array(0))).toBe(expected)
    })

    it('accepts a Buffer and matches the equivalent Uint8Array', () => {
      const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef])
      expect(blobHashOf(buf)).toBe(blobHashOf(new Uint8Array(buf)))
    })

    it('always returns a 44-char URL-safe base64 value (Q + 43)', () => {
      for (const s of ['', 'a', 'hello', 'x'.repeat(10_000)]) {
        const h = blobHashOf(new TextEncoder().encode(s))
        expect(h).toHaveLength(44)
        expect(h[0]).toBe('Q')
        // base64url: no '+', '/', or '=' padding.
        expect(/^Q[A-Za-z0-9_-]{43}$/.test(h)).toBe(true)
      }
    })

    it('differs for different content', () => {
      const a = blobHashOf(new TextEncoder().encode('a'))
      const b = blobHashOf(new TextEncoder().encode('b'))
      expect(a).not.toBe(b)
      expect(a.startsWith('Q')).toBe(true)
    })
  })

  describe('verifyBlobHash', () => {
    it('passes when content matches the Q hash', () => {
      const bytes = new TextEncoder().encode('hello')
      expect(() => verifyBlobHash(blobHashOf(bytes), bytes)).not.toThrow()
    })

    it('passes against an independently-constructed hash (not just round-trip)', () => {
      // Build the expected hash without blobHashOf so a shared bug can't hide.
      const bytes = new TextEncoder().encode('integrity')
      const independent =
        'Q' + crypto.createHash('sha256').update(bytes).digest('base64url')
      expect(() => verifyBlobHash(independent, bytes)).not.toThrow()
    })

    it('passes for empty content', () => {
      const empty = new Uint8Array(0)
      expect(() => verifyBlobHash(blobHashOf(empty), empty)).not.toThrow()
    })

    it('passes for an S-prefixed hash sharing the digest body', () => {
      const bytes = new TextEncoder().encode('manifest')
      const sHash = 'S' + blobHashOf(bytes).slice(1)
      expect(() => verifyBlobHash(sHash, bytes)).not.toThrow()
    })

    it('throws on a content mismatch', () => {
      const bytes = new TextEncoder().encode('hello')
      const wrong = blobHashOf(new TextEncoder().encode('goodbye'))
      expect(() => verifyBlobHash(wrong, bytes)).toThrow(
        /blob integrity check failed/,
      )
    })

    it('detects a single-byte difference', () => {
      const hash = blobHashOf(new TextEncoder().encode('payload-v1'))
      const tampered = new TextEncoder().encode('payload-v2')
      expect(() => verifyBlobHash(hash, tampered)).toThrow(
        /blob integrity check failed/,
      )
    })

    it('reports the actual computed hash in the error', () => {
      const bytes = new TextEncoder().encode('actual-content')
      const wrong = blobHashOf(new TextEncoder().encode('something-else'))
      expect(() => verifyBlobHash(wrong, bytes)).toThrow(blobHashOf(bytes))
    })
  })
})
