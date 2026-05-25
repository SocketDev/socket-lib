/**
 * @file Unit tests for src/fs/encoding — normalizeEncoding and
 *   normalizeEncodingSlow. Split out of the historical monolithic
 *   test/unit/fs.test.mts to keep each test file under the fleet's 500-line
 *   soft cap.
 */

import { describe, expect, it } from 'vitest'

import {
  normalizeEncoding,
  normalizeEncodingSlow,
} from '../../../src/fs/encoding'

describe('normalizeEncoding', () => {
  it('should handle null and undefined as utf8', () => {
    expect(normalizeEncoding(undefined)).toBe('utf8')
    expect(normalizeEncoding(undefined)).toBe('utf8')
  })

  it('should handle utf8 and utf-8', () => {
    expect(normalizeEncoding('utf8')).toBe('utf8')
    expect(normalizeEncoding('utf-8')).toBe('utf8')
  })

  it('should normalize UTF-8 with different cases', () => {
    expect(normalizeEncoding('UTF8')).toBe('utf8')
    expect(normalizeEncoding('UTF-8')).toBe('utf8')
    expect(normalizeEncoding('uTf8')).toBe('utf8')
    expect(normalizeEncoding('uTf-8')).toBe('utf8')
  })

  it('should normalize ascii', () => {
    expect(normalizeEncoding('ascii')).toBe('ascii')
    expect(normalizeEncoding('ASCII')).toBe('ascii')
    expect(normalizeEncoding('AsCiI')).toBe('ascii')
  })

  it('should normalize hex', () => {
    expect(normalizeEncoding('hex')).toBe('hex')
    expect(normalizeEncoding('HEX')).toBe('hex')
    expect(normalizeEncoding('HeX')).toBe('hex')
  })

  it('should normalize base64', () => {
    expect(normalizeEncoding('base64')).toBe('base64')
    expect(normalizeEncoding('BASE64')).toBe('base64')
    expect(normalizeEncoding('BaSe64')).toBe('base64')
  })

  it('should normalize base64url', () => {
    expect(normalizeEncoding('base64url')).toBe('base64url')
    expect(normalizeEncoding('BASE64URL')).toBe('base64url')
    expect(normalizeEncoding('BaSe64UrL')).toBe('base64url')
  })

  it('should normalize latin1 and binary', () => {
    expect(normalizeEncoding('latin1')).toBe('latin1')
    expect(normalizeEncoding('LATIN1')).toBe('latin1')
    expect(normalizeEncoding('binary')).toBe('latin1')
    expect(normalizeEncoding('BINARY')).toBe('latin1')
    expect(normalizeEncoding('BiNaRy')).toBe('latin1')
    expect(normalizeEncoding('LaTiN1')).toBe('latin1')
  })

  it('should normalize mixed-case utf16le (length 7)', () => {
    expect(normalizeEncoding('UtF16Le')).toBe('utf16le')
  })

  it('should normalize mixed-case utf-16le (length 8)', () => {
    expect(normalizeEncoding('UtF-16le')).toBe('utf16le')
  })

  it('should normalize mixed-case base64url (length 9)', () => {
    expect(normalizeEncoding('Base64Url')).toBe('base64url')
  })

  it('should normalize ucs2 and ucs-2 to utf16le', () => {
    expect(normalizeEncoding('ucs2')).toBe('utf16le')
    expect(normalizeEncoding('UCS2')).toBe('utf16le')
    expect(normalizeEncoding('ucs-2')).toBe('utf16le')
    expect(normalizeEncoding('UCS-2')).toBe('utf16le')
    expect(normalizeEncoding('UcS-2')).toBe('utf16le')
  })

  it('should normalize utf16le and utf-16le', () => {
    expect(normalizeEncoding('utf16le')).toBe('utf16le')
    expect(normalizeEncoding('UTF16LE')).toBe('utf16le')
    expect(normalizeEncoding('utf-16le')).toBe('utf16le')
    expect(normalizeEncoding('UTF-16LE')).toBe('utf16le')
    expect(normalizeEncoding('UtF-16Le')).toBe('utf16le')
  })

  it('should return utf8 for unknown encodings', () => {
    expect(normalizeEncoding('unknown')).toBe('utf8')
    expect(normalizeEncoding('invalid')).toBe('utf8')
    expect(normalizeEncoding('xyz')).toBe('utf8')
  })
})

describe('normalizeEncodingSlow', () => {
  it('should handle ucs2 and ucs-2', () => {
    expect(normalizeEncodingSlow('ucs2')).toBe('utf16le')
    expect(normalizeEncodingSlow('UCS2')).toBe('utf16le')
    expect(normalizeEncodingSlow('uCs2')).toBe('utf16le')
    expect(normalizeEncodingSlow('ucs-2')).toBe('utf16le')
    expect(normalizeEncodingSlow('UCS-2')).toBe('utf16le')
    expect(normalizeEncodingSlow('uCs-2')).toBe('utf16le')
  })

  it('should handle hex', () => {
    expect(normalizeEncodingSlow('hex')).toBe('hex')
    expect(normalizeEncodingSlow('HEX')).toBe('hex')
    expect(normalizeEncodingSlow('hEx')).toBe('hex')
  })

  it('should handle ascii', () => {
    expect(normalizeEncodingSlow('ascii')).toBe('ascii')
    expect(normalizeEncodingSlow('ASCII')).toBe('ascii')
    expect(normalizeEncodingSlow('AsCiI')).toBe('ascii')
  })

  it('should handle base64', () => {
    expect(normalizeEncodingSlow('base64')).toBe('base64')
    expect(normalizeEncodingSlow('BASE64')).toBe('base64')
    expect(normalizeEncodingSlow('bAsE64')).toBe('base64')
  })

  it('should handle latin1 and binary', () => {
    expect(normalizeEncodingSlow('latin1')).toBe('latin1')
    expect(normalizeEncodingSlow('LATIN1')).toBe('latin1')
    expect(normalizeEncodingSlow('binary')).toBe('latin1')
    expect(normalizeEncodingSlow('BINARY')).toBe('latin1')
    expect(normalizeEncodingSlow('BiNaRy')).toBe('latin1')
  })

  it('should handle utf16le and utf-16le', () => {
    expect(normalizeEncodingSlow('utf16le')).toBe('utf16le')
    expect(normalizeEncodingSlow('UTF16LE')).toBe('utf16le')
    expect(normalizeEncodingSlow('UtF16Le')).toBe('utf16le')
    expect(normalizeEncodingSlow('utf-16le')).toBe('utf16le')
    expect(normalizeEncodingSlow('UTF-16LE')).toBe('utf16le')
    expect(normalizeEncodingSlow('UtF-16Le')).toBe('utf16le')
  })

  it('should handle base64url', () => {
    expect(normalizeEncodingSlow('base64url')).toBe('base64url')
    expect(normalizeEncodingSlow('BASE64URL')).toBe('base64url')
    expect(normalizeEncodingSlow('BaSe64uRl')).toBe('base64url')
  })

  it('should return utf8 for unknown encodings', () => {
    expect(normalizeEncodingSlow('unknown')).toBe('utf8')
    expect(normalizeEncodingSlow('invalid')).toBe('utf8')
    expect(normalizeEncodingSlow('xyz')).toBe('utf8')
  })

  it('should handle edge cases with different string lengths', () => {
    // Length 3 (hex)
    expect(normalizeEncodingSlow('hex')).toBe('hex')
    expect(normalizeEncodingSlow('abc')).toBe('utf8')

    // Length 4 (ucs2)
    expect(normalizeEncodingSlow('ucs2')).toBe('utf16le')
    expect(normalizeEncodingSlow('test')).toBe('utf8')

    // Length 5 (ascii, ucs-2)
    expect(normalizeEncodingSlow('ascii')).toBe('ascii')
    expect(normalizeEncodingSlow('ucs-2')).toBe('utf16le')
    expect(normalizeEncodingSlow('tests')).toBe('utf8')

    // Length 6 (base64, latin1, binary)
    expect(normalizeEncodingSlow('base64')).toBe('base64')
    expect(normalizeEncodingSlow('latin1')).toBe('latin1')
    expect(normalizeEncodingSlow('binary')).toBe('latin1')

    // Length 7 (utf16le)
    expect(normalizeEncodingSlow('utf16le')).toBe('utf16le')

    // Length 8 (utf-16le)
    expect(normalizeEncodingSlow('utf-16le')).toBe('utf16le')

    // Length 9 (base64url)
    expect(normalizeEncodingSlow('base64url')).toBe('base64url')
  })

  it('should handle mixed case for hex length 3 with OR conditions', () => {
    // Test the OR conditions in the hex branch
    expect(normalizeEncodingSlow('hEx')).toBe('hex')
    expect(normalizeEncodingSlow('heX')).toBe('hex')
    expect(normalizeEncodingSlow('Hex')).toBe('hex')
  })

  it('should handle length 4 mixed case scenarios', () => {
    // Test mixed cases that fall through to toLowerCase
    expect(normalizeEncodingSlow('UcS2')).toBe('utf16le')
    expect(normalizeEncodingSlow('uCS2')).toBe('utf16le')
    expect(normalizeEncodingSlow('Ucs2')).toBe('utf16le')
  })

  it('should handle length 5 with mixed case that uses toLowerCase', () => {
    // Test cases that need toLowerCase for ascii
    expect(normalizeEncodingSlow('AsCii')).toBe('ascii')
    expect(normalizeEncodingSlow('aSCII')).toBe('ascii')
    expect(normalizeEncodingSlow('AscII')).toBe('ascii')
    // Test cases that need toLowerCase for ucs-2
    expect(normalizeEncodingSlow('UcS-2')).toBe('utf16le')
    expect(normalizeEncodingSlow('uCS-2')).toBe('utf16le')
    expect(normalizeEncodingSlow('Ucs-2')).toBe('utf16le')
  })

  it('should handle length 6 with mixed case that uses toLowerCase', () => {
    // Test cases that need toLowerCase for base64
    expect(normalizeEncodingSlow('BaSe64')).toBe('base64')
    expect(normalizeEncodingSlow('bAsE64')).toBe('base64')
    expect(normalizeEncodingSlow('Base64')).toBe('base64')
    // Test cases that need toLowerCase for latin1
    expect(normalizeEncodingSlow('LaTin1')).toBe('latin1')
    expect(normalizeEncodingSlow('lAtIn1')).toBe('latin1')
    expect(normalizeEncodingSlow('Latin1')).toBe('latin1')
    // Test cases that need toLowerCase for binary
    expect(normalizeEncodingSlow('BiNaRy')).toBe('latin1')
    expect(normalizeEncodingSlow('bInArY')).toBe('latin1')
    expect(normalizeEncodingSlow('Binary')).toBe('latin1')
  })

  it('should handle non-matching hex length != 3', () => {
    // Ensure hex with different lengths returns utf8
    expect(normalizeEncodingSlow('he')).toBe('utf8')
    expect(normalizeEncodingSlow('hexh')).toBe('utf8')
  })
})
