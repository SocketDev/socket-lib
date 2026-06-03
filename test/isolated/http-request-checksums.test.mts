/**
 * @file Unit tests for HTTP/HTTPS request utilities — checksum parsing and
 *   fetching. Split out of test/isolated/http-request-core.test.mts to keep
 *   each test file under the per-worker heap ceiling and the source-line cap.
 *   This file covers parseChecksumFile and fetchChecksumFile; the rest of the core
 *   surface (httpRequest) lives in http-request-core.test.mts. Both files share
 *   the same test server via http-request-fixtures.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  fetchChecksumFile,
  parseChecksumFile,
} from '../../src/http-request/checksum-file'
import { isIntegrity } from '../../src/integrity'

import { fixture, setupHttpFixture } from './http-request-fixtures'

setupHttpFixture()

// Known hex digests used as inputs to parseChecksumFile.
const HEX_A = 'abc123def456789012345678901234567890123456789012345678901234abcd'
const HEX_B = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab'
const HEX_C = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

// Pre-computed SRI equivalents (sha256-<base64>=).
const INT_A = 'sha256-q8Ej3vRWeJASNFZ4kBI0VniQEjRWeJASNFZ4kBI0q80='
const INT_B = 'sha256-/ty6mHZUMhD+3LqYdlQyEP7cuph2VDIQ/ty6mHZUMqs='
const INT_C = 'sha256-EjRWeJCrze8SNFZ4kKvN7xI0VniQq83vEjRWeJCrze8='
const INT_D = 'sha256-q83vEjRWeJCrze8SNFZ4kKvN7xI0VniQq83vEjRWeJA='

describe('http-request', () => {
  describe('parseChecksumFile', () => {
    it('should parse GNU-style checksums (two spaces)', () => {
      const text = `
${HEX_A}  file1.txt
${HEX_B}  file2.zip
`
      const checksums = parseChecksumFile(text)

      expect(checksums['file1.txt']).toBe(INT_A)
      expect(checksums['file2.zip']).toBe(INT_B)
    })

    it('should parse simple-style checksums (single space)', () => {
      const text = `${HEX_A} file.txt\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['file.txt']).toBe(INT_A)
    })

    it('should parse BSD-style checksums', () => {
      const text = `SHA256 (myfile.tar.gz) = ${HEX_A}\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['myfile.tar.gz']).toBe(INT_A)
    })

    it('should ignore comments and empty lines', () => {
      const text = `
# This is a comment
${HEX_A}  file.txt

# Another comment
`
      const checksums = parseChecksumFile(text)

      expect(Object.keys(checksums)).toHaveLength(1)
      expect(checksums['file.txt']).toBeDefined()
    })

    it('should normalize hashes to lowercase before converting to integrity', () => {
      const text = `${HEX_A.toUpperCase()}  FILE.txt\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['FILE.txt']).toBe(INT_A)
    })

    it('should return empty object for empty input', () => {
      const checksums = parseChecksumFile('')
      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should handle filenames with spaces', () => {
      const text = `${HEX_A}  file with spaces.txt\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['file with spaces.txt']).toBe(INT_A)
    })

    it('should handle mixed formats in same file', () => {
      const text = `
# Mixed format checksums file
${HEX_A}  gnu-style.txt
${HEX_C} bsd-single.txt
SHA256 (bsd-paren.tar.gz) = ${HEX_B}
`
      const checksums = parseChecksumFile(text)

      expect(checksums['gnu-style.txt']).toBe(INT_A)
      expect(checksums['bsd-single.txt']).toBe(INT_C)
      expect(checksums['bsd-paren.tar.gz']).toBe(INT_B)
    })

    it('should skip invalid lines', () => {
      const text = `
${HEX_A}  valid.txt
this is not a valid checksum line
tooshort  invalid.txt
${HEX_A}
`
      const checksums = parseChecksumFile(text)

      expect(Object.keys(checksums)).toHaveLength(1)
      expect(checksums['valid.txt']).toBeDefined()
    })

    it('should handle filenames with paths', () => {
      const text = `${HEX_A}  path/to/file.txt\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['path/to/file.txt']).toBe(INT_A)
    })

    it('should handle tab separator', () => {
      const text = `${HEX_A}\tfile.txt\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['file.txt']).toBe(INT_A)
    })

    it('should handle Windows line endings (CRLF)', () => {
      const text = `${HEX_A}  file1.txt\r\n${HEX_B}  file2.txt\r\n`
      const checksums = parseChecksumFile(text)

      expect(checksums['file1.txt']).toBe(INT_A)
      expect(checksums['file2.txt']).toBe(INT_B)
    })
  })

  describe('fetchChecksumFile', () => {
    it('should fetch and parse checksums from URL', async () => {
      const checksums = await fetchChecksumFile(`${fixture.baseUrl}/checksums.txt`)

      expect(checksums['checksum-file']).toBeDefined()
      expect(isIntegrity(checksums['checksum-file']!)).toBe(true)
      expect(checksums['other-file']).toBe(INT_D)
    })

    it('should handle single-space separator format', async () => {
      const checksums = await fetchChecksumFile(
        `${fixture.baseUrl}/checksums-single-space.txt`,
      )

      expect(checksums['checksum-file']).toBeDefined()
      expect(isIntegrity(checksums['checksum-file']!)).toBe(true)
    })

    it('should throw when URL returns 404', async () => {
      await expect(
        fetchChecksumFile(`${fixture.baseUrl}/not-found`),
      ).rejects.toThrow(/Failed to fetch checksums/)
    })

    it('should pass custom headers', async () => {
      const checksums = await fetchChecksumFile(
        `${fixture.baseUrl}/checksums.txt`,
        {
          headers: { 'X-Custom': 'value' },
        },
      )

      expect(checksums['checksum-file']).toBeDefined()
    })

    it('should respect timeout option', async () => {
      await expect(
        fetchChecksumFile(`${fixture.baseUrl}/timeout`, { timeout: 100 }),
      ).rejects.toThrow(/timed out/)
    })

    it('should return empty object for empty checksums file', async () => {
      const checksums = await fetchChecksumFile(
        `${fixture.baseUrl}/checksums-empty.txt`,
      )

      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should return object with null prototype', async () => {
      const checksums = await fetchChecksumFile(`${fixture.baseUrl}/checksums.txt`)

      expect(Object.getPrototypeOf(checksums)).toBeNull()
      expect(checksums['constructor']).toBeUndefined()
      expect('toString' in checksums).toBe(false)
    })
  })
})
