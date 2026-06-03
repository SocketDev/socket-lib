/**
 * @file Unit tests for getGhsaUrl(), which constructs GitHub Security Advisory
 *   URLs from GHSA IDs. Pure string formatting — no network, no environment.
 *   Token retrieval and HTTP-facing tests live in github.test.mts and
 *   github-http.test.mts.
 */

import { getGhsaUrl } from '../../src/github/request'
import { describe, expect, it } from 'vitest'

describe.sequential('github ghsa url', () => {
  describe('getGhsaUrl', () => {
    it('should generate correct GHSA URL', () => {
      const url = getGhsaUrl('GHSA-xxxx-xxxx-xxxx')
      expect(url).toBe('https://github.com/advisories/GHSA-xxxx-xxxx-xxxx')
    })

    it('should handle different GHSA IDs', () => {
      const url = getGhsaUrl('GHSA-1234-5678-9abc')
      expect(url).toBe('https://github.com/advisories/GHSA-1234-5678-9abc')
    })

    it('should handle GHSA IDs with special characters', () => {
      const url = getGhsaUrl('GHSA-abcd-efgh-ijkl')
      expect(url).toBe('https://github.com/advisories/GHSA-abcd-efgh-ijkl')
    })

    it('should handle uppercase GHSA IDs', () => {
      const url = getGhsaUrl('GHSA-XXXX-YYYY-ZZZZ')
      expect(url).toBe('https://github.com/advisories/GHSA-XXXX-YYYY-ZZZZ')
    })

    it('should handle lowercase GHSA IDs', () => {
      const url = getGhsaUrl('ghsa-xxxx-yyyy-zzzz')
      expect(url).toBe('https://github.com/advisories/ghsa-xxxx-yyyy-zzzz')
    })

    it('should handle GHSA IDs with numbers', () => {
      const url = getGhsaUrl('GHSA-1111-2222-3333')
      expect(url).toBe('https://github.com/advisories/GHSA-1111-2222-3333')
    })

    it('should handle empty GHSA ID', () => {
      const url = getGhsaUrl('')
      expect(url).toBe('https://github.com/advisories/')
    })
  })

  describe('URL formatting', () => {
    it('should maintain URL structure for all IDs', () => {
      const ids = [
        'GHSA-1234-5678-9abc',
        'GHSA-xxxx-yyyy-zzzz',
        'GHSA-abcd-efgh-ijkl',
        'ghsa-lowercase-test-id',
      ]
      for (let i = 0, { length } = ids; i < length; i += 1) {
        const id = ids[i]!
        const url = getGhsaUrl(id)
        expect(url).toMatch(/^https:\/\/github\.com\/advisories\//)
        expect(url).toContain(id)
      }
    })

    it('should handle GHSA IDs with URL-unsafe characters', () => {
      const id = 'GHSA-test%20with%20spaces'
      const url = getGhsaUrl(id)
      expect(url).toContain(id)
    })
  })
})
