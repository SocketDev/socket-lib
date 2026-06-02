/**
 * @file Unit tests for the integrity/checksum surface.
 */
import { describe, expect, it } from 'vitest'

import {
  DlxHashMismatchError,
  checksumToIntegrity,
  computeHashes,
  integrityToChecksum,
  isChecksum,
  isIntegrity,
  normalizeHash,
  parseIntegrity,
  verifyHash,
} from '../../src/integrity'

import type { ComputedHashes, NormalizedHash } from '../../src/integrity'

// Known-correct pair for pnpm v10 darwin-arm64 release asset:
// the actual sha256 hex digest of the tarball next to its sha256 SRI form.
const KNOWN_HEX =
  '3620a0fcaf81ecd3aaeccd5965919d90dbc913f4d07a96e11e7cafc2c785054b'
const KNOWN_SRI = 'sha256-NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs='

describe('integrity', () => {
  describe('isIntegrity', () => {
    it('accepts sha256 SRI', () => {
      expect(isIntegrity(KNOWN_SRI)).toBe(true)
    })

    it('accepts sha384 SRI', () => {
      expect(isIntegrity('sha384-' + 'A'.repeat(64) + '=')).toBe(true)
    })

    it('accepts sha512 SRI', () => {
      expect(isIntegrity('sha512-' + 'A'.repeat(86) + '==')).toBe(true)
    })

    it('rejects sha1 SRI (outside W3C SRI set)', () => {
      expect(isIntegrity('sha1-abc==')).toBe(false)
    })

    it('rejects md5 SRI (outside W3C SRI set)', () => {
      expect(isIntegrity('md5-abc==')).toBe(false)
    })

    it('rejects hex without algorithm prefix', () => {
      expect(isIntegrity(KNOWN_HEX)).toBe(false)
    })

    it('rejects empty body', () => {
      expect(isIntegrity('sha256-')).toBe(false)
    })

    it('rejects empty string', () => {
      expect(isIntegrity('')).toBe(false)
    })

    it('rejects malformed (no dash)', () => {
      expect(isIntegrity('sha256NiCg')).toBe(false)
    })
  })

  describe('isChecksum', () => {
    it('accepts a canonical sha256 hex digest', () => {
      expect(isChecksum(KNOWN_HEX)).toBe(true)
    })

    it('accepts uppercase hex', () => {
      expect(isChecksum(KNOWN_HEX.toUpperCase())).toBe(true)
    })

    it('rejects 63 chars (too short)', () => {
      expect(isChecksum('a'.repeat(63))).toBe(false)
    })

    it('rejects 65 chars (too long)', () => {
      expect(isChecksum('a'.repeat(65))).toBe(false)
    })

    it('rejects non-hex chars', () => {
      expect(isChecksum('z'.repeat(64))).toBe(false)
    })

    it('rejects SRI form', () => {
      expect(isChecksum(KNOWN_SRI)).toBe(false)
    })

    it('rejects empty string', () => {
      expect(isChecksum('')).toBe(false)
    })
  })

  describe('parseIntegrity', () => {
    it('extracts algorithm + body from sha256 SRI', () => {
      expect(parseIntegrity(KNOWN_SRI)).toEqual({
        algorithm: 'sha256',
        body: 'NiCg/K+B7NOq7M1ZZZGdkNvJE/TQepbhHnyvwseFBUs=',
      })
    })

    it('extracts algorithm + body from sha384 SRI', () => {
      const body = 'A'.repeat(64) + '='
      expect(parseIntegrity(`sha384-${body}`)).toEqual({
        algorithm: 'sha384',
        body,
      })
    })

    it('extracts algorithm + body from sha512 SRI', () => {
      const body = 'A'.repeat(86) + '=='
      expect(parseIntegrity(`sha512-${body}`)).toEqual({
        algorithm: 'sha512',
        body,
      })
    })

    it('throws on hex (no algorithm prefix)', () => {
      expect(() => parseIntegrity(KNOWN_HEX)).toThrow(/invalid SRI format/)
    })

    it('throws on sha1 (outside W3C SRI set)', () => {
      expect(() => parseIntegrity('sha1-abc==')).toThrow(/invalid SRI format/)
    })

    it('throws on empty body', () => {
      expect(() => parseIntegrity('sha256-')).toThrow(/invalid SRI format/)
    })
  })

  describe('checksumToIntegrity', () => {
    it('converts hex to sha256 SRI by default', () => {
      expect(checksumToIntegrity(KNOWN_HEX)).toBe(KNOWN_SRI)
    })

    it('is idempotent on SRI input', () => {
      expect(checksumToIntegrity(KNOWN_SRI)).toBe(KNOWN_SRI)
    })

    it('is idempotent on sha512 SRI input (passes through, ignoring algorithm arg)', () => {
      const sri = 'sha512-' + 'A'.repeat(86) + '=='
      expect(checksumToIntegrity(sri)).toBe(sri)
    })

    it('honors algorithm override for hex input', () => {
      const got = checksumToIntegrity(KNOWN_HEX, 'sha384')
      expect(got.startsWith('sha384-')).toBe(true)
      // Body is the base64 of the input hex regardless of algorithm — the
      // helper does not re-hash; that's a caller responsibility when the
      // hex doesn't actually match the declared algorithm.
      expect(parseIntegrity(got).body).toBe(
        Buffer.from(KNOWN_HEX, 'hex').toString('base64'),
      )
    })

    it('throws on a string that is neither hex nor SRI', () => {
      expect(() => checksumToIntegrity('not-a-hash')).toThrow(TypeError)
    })

    it('throws on empty string', () => {
      expect(() => checksumToIntegrity('')).toThrow(TypeError)
    })
  })

  describe('integrityToChecksum', () => {
    it('converts sha256 SRI to hex', () => {
      expect(integrityToChecksum(KNOWN_SRI)).toBe(KNOWN_HEX)
    })

    it('is idempotent on hex input', () => {
      expect(integrityToChecksum(KNOWN_HEX)).toBe(KNOWN_HEX)
    })

    it('throws on sha384 SRI (checksums are sha256-only)', () => {
      const sri = 'sha384-' + 'A'.repeat(64) + '='
      expect(() => integrityToChecksum(sri)).toThrow(
        /sha384 integrity has no 64-hex-char checksum form/,
      )
    })

    it('throws on sha512 SRI (checksums are sha256-only)', () => {
      const sri = 'sha512-' + 'A'.repeat(86) + '=='
      expect(() => integrityToChecksum(sri)).toThrow(
        /sha512 integrity has no 64-hex-char checksum form/,
      )
    })

    it('throws on garbage string (neither hex nor SRI)', () => {
      expect(() => integrityToChecksum('not-a-hash')).toThrow(
        /invalid SRI format/,
      )
    })

    it('round-trips: checksumToIntegrity(integrityToChecksum(sri)) === sri', () => {
      expect(checksumToIntegrity(integrityToChecksum(KNOWN_SRI))).toBe(
        KNOWN_SRI,
      )
    })

    it('round-trips: integrityToChecksum(checksumToIntegrity(hex)) === hex', () => {
      expect(integrityToChecksum(checksumToIntegrity(KNOWN_HEX))).toBe(
        KNOWN_HEX,
      )
    })
  })

  describe('normalizeHash', () => {
    it('sniffs sha512 SRI string as integrity', () => {
      const sri = 'sha512-' + 'A'.repeat(86) + '=='
      expect(normalizeHash(sri)).toEqual({ type: 'integrity', value: sri })
    })

    it('sniffs sha256 SRI as integrity', () => {
      expect(normalizeHash(KNOWN_SRI)).toEqual({
        type: 'integrity',
        value: KNOWN_SRI,
      })
    })

    it('sniffs sha384 SRI as integrity', () => {
      const sri = 'sha384-' + 'A'.repeat(64) + '='
      expect(normalizeHash(sri)).toEqual({ type: 'integrity', value: sri })
    })

    it('sniffs 64-char hex as checksum', () => {
      expect(normalizeHash(KNOWN_HEX)).toEqual({
        type: 'checksum',
        value: KNOWN_HEX,
      })
    })

    it('accepts explicit integrity object', () => {
      expect(normalizeHash({ type: 'integrity', value: KNOWN_SRI })).toEqual({
        type: 'integrity',
        value: KNOWN_SRI,
      })
    })

    it('accepts explicit checksum object', () => {
      expect(normalizeHash({ type: 'checksum', value: KNOWN_HEX })).toEqual({
        type: 'checksum',
        value: KNOWN_HEX,
      })
    })

    it('rejects sha1 SRI (insecure, outside W3C set)', () => {
      expect(() => normalizeHash('sha1-abc==')).toThrow(TypeError)
    })

    it('rejects sha1 hex (40 chars, wrong length)', () => {
      expect(() => normalizeHash('a'.repeat(40))).toThrow(TypeError)
    })

    it('rejects random strings', () => {
      expect(() => normalizeHash('not-a-hash')).toThrow(TypeError)
    })

    it('rejects unknown hash object type', () => {
      expect(() =>
        normalizeHash({ type: 'sha1', value: 'abc' } as never),
      ).toThrow(TypeError)
    })

    it('rejects integrity object with malformed value', () => {
      expect(() =>
        normalizeHash({ type: 'integrity', value: 'notsha-anything' }),
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
      const bytes = Buffer.from('hello world', 'utf8')
      const result = computeHashes(bytes)
      expect(result.integrity).toBe(
        'sha512-MJ7MSJwS1utMxA9QyQLytNDtd+5RGnx6m808qG1M2G+YndNbxf9JlnDaNCVbRbDP2DDoH2Bdz33FVC6TrpzXbw==',
      )
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

    it('checksum from computeHashes round-trips through the converters', () => {
      const bytes = Buffer.from('round trip me', 'utf8')
      const { checksum } = computeHashes(bytes)
      const sri = checksumToIntegrity(checksum)
      expect(integrityToChecksum(sri)).toBe(checksum)
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
        value: 'sha512-' + 'W'.repeat(86) + '==',
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
        value: 'sha512-' + 'W'.repeat(86) + '==',
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

    it('error message names the mismatched type', () => {
      const expected: NormalizedHash = {
        type: 'checksum',
        value: '0'.repeat(64),
      }
      try {
        verifyHash(expected, computed)
        expect.fail('should have thrown')
      } catch (e) {
        expect((e as Error).message).toMatch(/Hash mismatch \(checksum\)/)
      }
    })
  })
})
