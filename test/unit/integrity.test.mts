/**
 * @file Unit tests for the integrity/checksum surface.
 */
import { describe, expect, it } from 'vitest'

import {
  checksumToIntegrity,
  computeHash,
  computeHashes,
  DlxHashMismatchError,
  equalHashes,
  HashMismatchError,
  integrityToChecksum,
  isChecksum,
  isHex,
  isIntegrity,
  makeHash,
  normalizeHash,
  parseHash,
  parseIntegrity,
  verifyHash,
} from '../../src/integrity'

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

    it('emits integrity as sha512 (the canonical OUR-side algorithm)', () => {
      // Load-bearing invariant: OUR integrity values are sha512, not sha256.
      // The whole fleet's integrity convention depends on this. A refactor that
      // downgrades the integrity field would silently weaken every consumer's
      // pin; this assertion fails loudly if that happens.
      const { checksum, integrity } = computeHashes(Buffer.from('x'))
      expect(integrity.startsWith('sha512-')).toBe(true)
      // The checksum field stays sha256 hex — the upstream-SHASUMS interop shape.
      expect(checksum).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  describe('parseHash', () => {
    it('parses a sha256 SRI into algorithm + hex + sri', () => {
      const h = parseHash(KNOWN_SRI)
      expect(h.algorithm).toBe('sha256')
      expect(h.hex).toBe(KNOWN_HEX)
      expect(h.sri).toBe(KNOWN_SRI)
    })

    it('infers sha256 from a 64-char hex digest', () => {
      const h = parseHash(KNOWN_HEX)
      expect(h.algorithm).toBe('sha256')
      expect(h.sri).toBe(KNOWN_SRI)
    })

    it('infers sha384 (96) and sha512 (128) from hex length', () => {
      expect(parseHash('a'.repeat(96)).algorithm).toBe('sha384')
      expect(parseHash('a'.repeat(128)).algorithm).toBe('sha512')
    })

    it('lowercases hex and is idempotent on a Hash', () => {
      const h = parseHash(KNOWN_HEX.toUpperCase())
      expect(h.hex).toBe(KNOWN_HEX)
      expect(parseHash(h)).toEqual(h)
    })

    it('returns a frozen value', () => {
      expect(Object.isFrozen(parseHash(KNOWN_HEX))).toBe(true)
    })

    it('throws on a hex digest of unrecognized length (e.g. sha1)', () => {
      expect(() => parseHash('a'.repeat(40))).toThrow(TypeError)
    })

    it('throws when an SRI body length contradicts its algorithm', () => {
      // sha512 prefix but a 32-byte (sha256-length) body.
      expect(() => parseHash(`sha512-${KNOWN_SRI.slice(7)}`)).toThrow(TypeError)
    })

    it('throws on garbage', () => {
      expect(() => parseHash('not-a-hash')).toThrow(TypeError)
    })
  })

  describe('computeHash', () => {
    it('defaults to sha512', () => {
      const h = computeHash(Buffer.from('x'))
      expect(h.algorithm).toBe('sha512')
      expect(h.sri.startsWith('sha512-')).toBe(true)
    })

    it('computes sha256 when asked, matching computeHashes().checksum', () => {
      const h = computeHash(Buffer.from('hello world', 'utf8'), 'sha256')
      expect(h.hex).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      )
    })

    it('is deterministic', () => {
      const bytes = Buffer.from('determinism')
      const a = computeHash(bytes)
      const b = computeHash(bytes)
      expect(a).toEqual(b)
    })
  })

  describe('makeHash', () => {
    it('builds a frozen Hash with both encodings', () => {
      const h = makeHash('sha256', KNOWN_HEX)
      expect(h).toEqual({ algorithm: 'sha256', hex: KNOWN_HEX, sri: KNOWN_SRI })
      expect(Object.isFrozen(h)).toBe(true)
    })

    it('lowercases the hex', () => {
      expect(makeHash('sha256', KNOWN_HEX.toUpperCase()).hex).toBe(KNOWN_HEX)
    })
  })

  describe('isHex', () => {
    it('accepts recognized digest lengths (64/96/128)', () => {
      expect(isHex('a'.repeat(64))).toBe(true)
      expect(isHex('a'.repeat(96))).toBe(true)
      expect(isHex('a'.repeat(128))).toBe(true)
    })

    it('rejects other lengths, non-hex, and SRI', () => {
      expect(isHex('a'.repeat(40))).toBe(false)
      expect(isHex('xyz')).toBe(false)
      expect(isHex(KNOWN_SRI)).toBe(false)
    })
  })

  describe('equalHashes', () => {
    it('true for the same digest across encodings (SRI vs hex)', () => {
      expect(equalHashes(KNOWN_SRI, KNOWN_HEX)).toBe(true)
    })

    it('false for different digests of the same algorithm', () => {
      expect(equalHashes(KNOWN_HEX, '0'.repeat(64))).toBe(false)
    })

    it('false across algorithms (a sha512 is never equal to a sha256)', () => {
      const bytes = Buffer.from('x')
      const big = computeHash(bytes, 'sha512')
      const small = computeHash(bytes, 'sha256')
      expect(equalHashes(big, small)).toBe(false)
    })

    it('accepts Hash objects on either side', () => {
      expect(equalHashes(parseHash(KNOWN_HEX), KNOWN_SRI)).toBe(true)
    })

    it('throws on unparseable input', () => {
      expect(() => equalHashes('garbage', KNOWN_HEX)).toThrow(TypeError)
    })
  })

  describe('verifyHash', () => {
    const bytes = Buffer.from('verify me')
    const sha512 = computeHash(bytes, 'sha512')
    const sha256 = computeHash(bytes, 'sha256')

    it('accepts a matching sha512 SRI', () => {
      expect(() => verifyHash(bytes, sha512.sri)).not.toThrow()
    })

    it('accepts a matching sha256 hex (SHA256SUMS shape)', () => {
      expect(() => verifyHash(bytes, sha256.hex)).not.toThrow()
    })

    it('accepts a matching sha256 SRI (encoding-agnostic)', () => {
      expect(() => verifyHash(bytes, sha256.sri)).not.toThrow()
    })

    it('accepts a Hash object and honors its declared algorithm', () => {
      expect(() => verifyHash(bytes, sha256)).not.toThrow()
      expect(() => verifyHash(bytes, sha512)).not.toThrow()
    })

    it('throws HashMismatchError when the digest differs', () => {
      const wrong = makeHash('sha512', 'a'.repeat(128))
      expect(() => verifyHash(bytes, wrong)).toThrow(/Hash mismatch/)
    })

    it('DlxHashMismatchError is an alias for HashMismatchError', () => {
      const isAlias = DlxHashMismatchError === HashMismatchError
      expect(isAlias).toBe(true)
    })

    it('error carries expected + actual as Hash; message names the algorithm', () => {
      try {
        verifyHash(bytes, makeHash('sha256', '0'.repeat(64)))
        expect.fail('should have thrown')
      } catch (e) {
        const err = e as HashMismatchError
        expect(err.name).toBe('HashMismatchError')
        expect(err.expected.algorithm).toBe('sha256')
        expect(err.actual.hex).toBe(sha256.hex)
        expect(err.message).toMatch(/Hash mismatch \(sha256\)/)
      }
    })
  })
})
