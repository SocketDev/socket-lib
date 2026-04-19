/**
 * @fileoverview Unit tests for dlx integrity helpers.
 */

import { describe, expect, it } from 'vitest'

import {
  DlxHashMismatchError,
  computeHashes,
  normalizeHash,
  verifyHash,
} from '@socketsecurity/lib/dlx/integrity'

import type {
  ComputedHashes,
  NormalizedHash,
} from '@socketsecurity/lib/dlx/integrity'

describe('dlx/integrity', () => {
  describe('normalizeHash', () => {
    it('sniffs sha512 SRI string as integrity', () => {
      const result = normalizeHash('sha512-abc123==')
      expect(result).toEqual({ type: 'integrity', value: 'sha512-abc123==' })
    })

    it('sniffs 64-char hex string as checksum', () => {
      const hex = 'a'.repeat(64)
      const result = normalizeHash(hex)
      expect(result).toEqual({ type: 'checksum', value: hex })
    })

    it('accepts explicit integrity object', () => {
      const result = normalizeHash({
        type: 'integrity',
        value: 'sha512-abc123==',
      })
      expect(result).toEqual({ type: 'integrity', value: 'sha512-abc123==' })
    })

    it('accepts explicit checksum object', () => {
      const hex = 'f'.repeat(64)
      const result = normalizeHash({ type: 'checksum', value: hex })
      expect(result).toEqual({ type: 'checksum', value: hex })
    })

    it('rejects sha256 SRI (only sha512 supported)', () => {
      expect(() => normalizeHash('sha256-abc==')).toThrow(TypeError)
    })

    it('rejects sha1 SRI (insecure)', () => {
      expect(() => normalizeHash('sha1-abc==')).toThrow(TypeError)
    })

    it('rejects sha1 hex (40 chars, wrong length)', () => {
      expect(() => normalizeHash('a'.repeat(40))).toThrow(TypeError)
    })

    it('rejects random strings', () => {
      expect(() => normalizeHash('not-a-hash')).toThrow(TypeError)
    })

    it('rejects integrity object with malformed value', () => {
      expect(() =>
        normalizeHash({ type: 'integrity', value: 'notsha512' }),
      ).toThrow(TypeError)
    })

    it('rejects checksum object with malformed value', () => {
      expect(() =>
        normalizeHash({ type: 'checksum', value: 'nothex!' }),
      ).toThrow(TypeError)
    })

    it('rejects non-string, non-object', () => {
      expect(() => normalizeHash(42 as unknown as string)).toThrow(TypeError)
    })
  })

  describe('computeHashes', () => {
    it('computes both sha512 SRI and sha256 hex for known bytes', () => {
      // Known bytes: UTF-8 "hello world"
      const bytes = Buffer.from('hello world', 'utf8')
      const result = computeHashes(bytes)
      // sha512 of "hello world" (base64): known value
      expect(result.integrity).toBe(
        'sha512-MJ7MSJwS1utMxA9QyQLytNDtd+5RGnx6m808qG1M2G+YndNbxf9JlnDaNCVbRbDP2DDoH2Bdz33FVC6TrpzXbw==',
      )
      // sha256 of "hello world" (hex)
      expect(result.checksum).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      )
    })

    it('is deterministic across calls', () => {
      const bytes = Buffer.from('test input')
      const a = computeHashes(bytes)
      const b = computeHashes(bytes)
      expect(a).toEqual(b)
    })
  })

  describe('verifyHash', () => {
    const bytes = Buffer.from('verify me')
    const computed: ComputedHashes = computeHashes(bytes)

    it('accepts matching integrity', () => {
      const expected: NormalizedHash = {
        type: 'integrity',
        value: computed.integrity,
      }
      expect(() => verifyHash(expected, computed)).not.toThrow()
    })

    it('accepts matching checksum', () => {
      const expected: NormalizedHash = {
        type: 'checksum',
        value: computed.checksum,
      }
      expect(() => verifyHash(expected, computed)).not.toThrow()
    })

    it('throws DlxHashMismatchError when integrity differs', () => {
      const expected: NormalizedHash = {
        type: 'integrity',
        value: 'sha512-WRONG==',
      }
      expect(() => verifyHash(expected, computed)).toThrow(DlxHashMismatchError)
    })

    it('throws DlxHashMismatchError when checksum differs', () => {
      const expected: NormalizedHash = {
        type: 'checksum',
        value: '0'.repeat(64),
      }
      expect(() => verifyHash(expected, computed)).toThrow(DlxHashMismatchError)
    })

    it('error carries expected and actual', () => {
      const expected: NormalizedHash = {
        type: 'integrity',
        value: 'sha512-WRONG==',
      }
      try {
        verifyHash(expected, computed)
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(DlxHashMismatchError)
        const err = e as DlxHashMismatchError
        expect(err.expected).toEqual(expected)
        expect(err.actual).toEqual(computed)
      }
    })
  })
})
