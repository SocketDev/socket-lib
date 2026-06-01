/**
 * @file Unit tests for HTTP/HTTPS request utilities — checksum parsing and
 *   fetching. Split out of test/isolated/http-request-core.test.mts to keep
 *   each test file under the per-worker heap ceiling and the source-line cap.
 *   This file covers parseChecksums and fetchChecksums; the rest of the core
 *   surface (httpRequest) lives in http-request-core.test.mts. Both files share
 *   the same test server via http-request-fixtures.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  fetchChecksums,
  parseChecksums,
} from '../../src/http-request/checksums'

import { fixture, setupHttpFixture } from './http-request-fixtures'

setupHttpFixture()

describe('http-request', () => {
  describe('parseChecksums', () => {
    it('should parse GNU-style checksums (two spaces)', () => {
      const text = `
abc123def456789012345678901234567890123456789012345678901234abcd  file1.txt
fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab  file2.zip
`
      const checksums = parseChecksums(text)

      expect(checksums['file1.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
      expect(checksums['file2.zip']).toBe(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab',
      )
    })

    it('should parse simple-style checksums (single space)', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd file.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['file.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should parse BSD-style checksums', () => {
      const text =
        'SHA256 (myfile.tar.gz) = abc123def456789012345678901234567890123456789012345678901234abcd\n'
      const checksums = parseChecksums(text)

      expect(checksums['myfile.tar.gz']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should ignore comments and empty lines', () => {
      const text = `
# This is a comment
abc123def456789012345678901234567890123456789012345678901234abcd  file.txt

# Another comment
`
      const checksums = parseChecksums(text)

      expect(Object.keys(checksums)).toHaveLength(1)
      expect(checksums['file.txt']).toBeDefined()
    })

    it('should normalize hashes to lowercase', () => {
      const text =
        'ABC123DEF456789012345678901234567890123456789012345678901234ABCD  FILE.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['FILE.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should return empty object for empty input', () => {
      const checksums = parseChecksums('')
      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should handle filenames with spaces', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd  file with spaces.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['file with spaces.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should handle mixed formats in same file', () => {
      const text = `
# Mixed format checksums file
abc123def456789012345678901234567890123456789012345678901234abcd  gnu-style.txt
1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef bsd-single.txt
SHA256 (bsd-paren.tar.gz) = fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab
`
      const checksums = parseChecksums(text)

      expect(checksums['gnu-style.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
      expect(checksums['bsd-single.txt']).toBe(
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      )
      expect(checksums['bsd-paren.tar.gz']).toBe(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab',
      )
    })

    it('should skip invalid lines', () => {
      const text = `
abc123def456789012345678901234567890123456789012345678901234abcd  valid.txt
this is not a valid checksum line
tooshort  invalid.txt
abc123def456789012345678901234567890123456789012345678901234abcd
`
      const checksums = parseChecksums(text)

      expect(Object.keys(checksums)).toHaveLength(1)
      expect(checksums['valid.txt']).toBeDefined()
    })

    it('should handle filenames with paths', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd  path/to/file.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['path/to/file.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should handle tab separator', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd\tfile.txt\n'
      const checksums = parseChecksums(text)

      expect(checksums['file.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
    })

    it('should handle Windows line endings (CRLF)', () => {
      const text =
        'abc123def456789012345678901234567890123456789012345678901234abcd  file1.txt\r\n' +
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab  file2.txt\r\n'
      const checksums = parseChecksums(text)

      expect(checksums['file1.txt']).toBe(
        'abc123def456789012345678901234567890123456789012345678901234abcd',
      )
      expect(checksums['file2.txt']).toBe(
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba98765432ab',
      )
    })
  })

  describe('fetchChecksums', () => {
    it('should fetch and parse checksums from URL', async () => {
      const checksums = await fetchChecksums(`${fixture.baseUrl}/checksums.txt`)

      expect(checksums['checksum-file']).toBeDefined()
      expect(checksums['checksum-file']).toHaveLength(64)
      expect(checksums['other-file']).toBe(
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      )
    })

    it('should handle single-space separator format', async () => {
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums-single-space.txt`,
      )

      expect(checksums['checksum-file']).toBeDefined()
      expect(checksums['checksum-file']).toHaveLength(64)
    })

    it('should throw when URL returns 404', async () => {
      await expect(
        fetchChecksums(`${fixture.baseUrl}/not-found`),
      ).rejects.toThrow(/Failed to fetch checksums/)
    })

    it('should pass custom headers', async () => {
      // Just verify it doesn't throw with custom headers.
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums.txt`,
        {
          headers: { 'X-Custom': 'value' },
        },
      )

      expect(checksums['checksum-file']).toBeDefined()
    })

    it('should respect timeout option', async () => {
      await expect(
        fetchChecksums(`${fixture.baseUrl}/timeout`, { timeout: 100 }),
      ).rejects.toThrow(/timed out/)
    })

    it('should return empty object for empty checksums file', async () => {
      const checksums = await fetchChecksums(
        `${fixture.baseUrl}/checksums-empty.txt`,
      )

      expect(Object.keys(checksums)).toHaveLength(0)
    })

    it('should return object with null prototype', async () => {
      const checksums = await fetchChecksums(`${fixture.baseUrl}/checksums.txt`)

      // Verify no prototype pollution possible.
      expect(Object.getPrototypeOf(checksums)).toBeNull()
      expect(checksums['constructor']).toBeUndefined()
      expect('toString' in checksums).toBe(false)
    })
  })
})
