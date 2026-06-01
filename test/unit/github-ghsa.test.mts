/**
 * @file Unit tests for the network-facing GHSA advisory helpers:
 *
 *   - fetchGhsaDetails() fetches GitHub Security Advisory details
 *   - cacheFetchGhsa() caches GHSA lookups
 *   - JSON parsing error handling for malformed GitHub API responses
 *
 *   These tests mock HTTP with nock. fetchGitHub() + resolveRefToSha() live in
 *   github-fetch.test.mts; token/URL helpers live in github.test.mts and
 *   github-ghsa-url.test.mts.
 */

import { fetchGitHub } from '../../src/github/fetch'
import { cacheFetchGhsa, fetchGhsaDetails } from '../../src/github/ghsa'
import { clearRefCache } from '../../src/github/refs'
import { resetEnv } from '../../src/env/rewire'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import nock from 'nock'

describe.sequential('github ghsa', () => {
  beforeEach(() => {
    // Clear environment variables
    resetEnv()
    clearRefCache()
  })

  afterEach(() => {
    resetEnv()
  })

  describe('fetchGhsaDetails', () => {
    afterEach(() => {
      nock.cleanAll()
    })

    it('should fetch GHSA details', async () => {
      const mockGhsa = {
        ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
        summary: 'Test vulnerability',
        details: 'Detailed description',
        severity: 'high',
        aliases: ['CVE-2024-1234'],
        published_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        withdrawn_at: undefined,
        references: [{ url: 'https://example.com/advisory' }],
        vulnerabilities: [
          {
            package: { ecosystem: 'npm', name: 'test-package' },
            vulnerableVersionRange: '< 1.0.0',
            firstPatchedVersion: { identifier: '1.0.0' },
          },
        ],
        cvss: {
          score: 7.5,
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
        },
        cwes: [
          { cweId: 'CWE-79', name: 'XSS', description: 'Cross-site scripting' },
        ],
      }

      nock('https://api.github.com')
        .get('/advisories/GHSA-xxxx-yyyy-zzzz')
        .reply(200, mockGhsa)

      const result = await fetchGhsaDetails('GHSA-xxxx-yyyy-zzzz')
      expect(result.ghsaId).toBe('GHSA-xxxx-yyyy-zzzz')
      expect(result.severity).toBe('high')
      expect(result.aliases).toContain('CVE-2024-1234')
    })

    it('should fall back to GraphQL on REST empty body and normalize fields', async () => {
      // REST returns 200 + empty body (incident shape). The fallback
      // hits GraphQL `securityAdvisory(ghsaId)` and normalizes the
      // two field-shape diffs:
      //   - severity: GraphQL uppercases ('MODERATE'), REST lowercases
      //   - aliases: GraphQL exposes a single `identifiers` list that
      //     includes the GHSA self-reference; REST excludes it
      nock('https://api.github.com')
        .get('/advisories/GHSA-aaaa-bbbb-cccc')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            securityAdvisory: {
              ghsaId: 'GHSA-aaaa-bbbb-cccc',
              summary: 'Curl uses incorrect cert path',
              description: 'Detailed description from GraphQL',
              severity: 'MODERATE',
              publishedAt: '2024-03-15T00:00:00Z',
              updatedAt: '2024-03-16T00:00:00Z',
              withdrawnAt: undefined,
              cvss: { score: 5.3, vectorString: 'CVSS:3.1/AV:N' },
              cwes: {
                nodes: [
                  {
                    cweId: 'CWE-295',
                    name: 'Cert Validation',
                    description: '',
                  },
                ],
              },
              references: [{ url: 'https://example.com/curl-advisory' }],
              vulnerabilities: {
                nodes: [
                  {
                    package: { ecosystem: 'NPM', name: 'curl-bridge' },
                    vulnerableVersionRange: '< 1.5.0',
                    firstPatchedVersion: { identifier: '1.5.0' },
                  },
                ],
              },
              identifiers: [
                { type: 'GHSA', value: 'GHSA-aaaa-bbbb-cccc' },
                { type: 'CVE', value: 'CVE-2024-9999' },
              ],
            },
          },
        })

      const result = await fetchGhsaDetails('GHSA-aaaa-bbbb-cccc')
      expect(result.ghsaId).toBe('GHSA-aaaa-bbbb-cccc')
      // severity normalized to lowercase
      expect(result.severity).toBe('moderate')
      // aliases contains only non-GHSA identifiers
      expect(result.aliases).toEqual(['CVE-2024-9999'])
      expect(result.details).toBe('Detailed description from GraphQL')
      expect(result.cvss?.score).toBe(5.3)
      expect(result.vulnerabilities[0]?.package.name).toBe('curl-bridge')
    })

    it('should NOT trigger GraphQL fallback on real 404', async () => {
      // 404 means the GHSA genuinely doesn't exist. Falling back to
      // GraphQL would just confirm what we already know and add a
      // pointless round trip. The fallback is reserved for the
      // empty-body incident shape only.
      nock('https://api.github.com')
        .get('/advisories/GHSA-not-real-id-xx')
        .reply(404, '')

      await expect(fetchGhsaDetails('GHSA-not-real-id-xx')).rejects.toThrow(
        'GitHub API error 404',
      )
    })

    it('should NOT trigger GraphQL fallback on rate-limit error', async () => {
      // Rate-limit errors throw `GitHubRateLimitError`, which is
      // distinct from `GitHubEmptyBodyError`. Falling back to
      // GraphQL would consume the same rate-limit budget and just
      // surface a confusing GraphQL rate-limit message instead of
      // the actionable "set GITHUB_TOKEN" REST message.
      nock('https://api.github.com')
        .get('/advisories/GHSA-rate-limited-xx')
        .reply(403, 'rate limit exceeded', {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        })

      await expect(fetchGhsaDetails('GHSA-rate-limited-xx')).rejects.toThrow(
        'GitHub API rate limit exceeded',
      )
    })

    it('should propagate GraphQL transport error when REST is empty and GraphQL fails', async () => {
      // REST returned 200 + empty (incident shape), so we tried
      // GraphQL. GraphQL itself failed (non-OK status). Surface
      // the GraphQL error so the user sees both transports failed
      // — there's no useful REST error to fall back on here
      // because REST "succeeded" with an empty body.
      nock('https://api.github.com')
        .get('/advisories/GHSA-double-fail-xx')
        .reply(200, '')
        .post('/graphql')
        .reply(503, 'graphql unavailable')

      await expect(fetchGhsaDetails('GHSA-double-fail-xx')).rejects.toThrow(
        /GraphQL/,
      )
    })

    it('should reject when GraphQL returns null securityAdvisory', async () => {
      // GraphQL returned successfully but the advisory query came
      // back as `securityAdvisory: null` (no advisory with that id
      // exists). Throw a clear "not found" error so the caller
      // doesn't silently consume a synthetic empty advisory.
      nock('https://api.github.com')
        .get('/advisories/GHSA-graphql-null-xx')
        .reply(200, '')
        .post('/graphql')
        .reply(200, { data: { securityAdvisory: undefined } })

      await expect(fetchGhsaDetails('GHSA-graphql-null-xx')).rejects.toThrow(
        // The GraphQL "null securityAdvisory" path now wraps in the
        // generic "both transports failed" surface error so the
        // caller gets one consistent message regardless of which way
        // GraphQL failed (null vs errors[] vs transport).
        /Failed to fetch advisory GHSA-graphql-null-xx/,
      )
    })

    it('should propagate errors[] from GraphQL fallback', async () => {
      // GraphQL returned an `errors[]` payload (malformed query,
      // permissions issue, etc.). The helper should throw with
      // the GraphQL error messages joined so the user can see
      // what the upstream complaint was.
      nock('https://api.github.com')
        .get('/advisories/GHSA-graphql-errors-xx')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          errors: [
            { message: 'Field "securityAdvisory" requires authorization' },
          ],
        })

      await expect(fetchGhsaDetails('GHSA-graphql-errors-xx')).rejects.toThrow(
        // GraphQL errors[] path wraps in the "both transports failed"
        // surface error. The original GraphQL message lives in
        // .cause for callers who want to drill down.
        /Failed to fetch advisory GHSA-graphql-errors-xx/,
      )
    })

    it('should forward auth token to GraphQL fallback', async () => {
      // Auth token threaded through to the GraphQL POST so private
      // / org-only advisory data resolves correctly during fallback.
      nock('https://api.github.com')
        .get('/advisories/GHSA-auth-fwd-xx')
        .reply(200, '')
        .post('/graphql')
        .matchHeader('Authorization', 'Bearer ghsa-token-zzz')
        .reply(200, {
          data: {
            securityAdvisory: {
              ghsaId: 'GHSA-auth-fwd-xx',
              summary: 'Auth-forwarded advisory',
              description: 'desc',
              severity: 'LOW',
              publishedAt: '2024-04-01T00:00:00Z',
              updatedAt: '2024-04-01T00:00:00Z',
              withdrawnAt: undefined,
              cvss: undefined,
              cwes: { nodes: [] },
              references: [],
              vulnerabilities: { nodes: [] },
              identifiers: [{ type: 'GHSA', value: 'GHSA-auth-fwd-xx' }],
            },
          },
        })

      const result = await fetchGhsaDetails('GHSA-auth-fwd-xx', {
        token: 'ghsa-token-zzz',
      })
      expect(result.severity).toBe('low')
      expect(result.aliases).toEqual([])
    })
  })

  describe('cacheFetchGhsa', () => {
    beforeEach(async () => {
      await clearRefCache()
    })

    afterEach(() => {
      nock.cleanAll()
    })

    it('should fetch and cache GHSA details', async () => {
      const mockGhsa = {
        ghsa_id: 'GHSA-cache-test-0001',
        summary: 'Cached test',
        details: 'Details',
        severity: 'medium',
        aliases: [],
        published_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        withdrawn_at: undefined,
        references: [],
        vulnerabilities: [],
        cvss: undefined,
        cwes: [],
      }

      nock('https://api.github.com')
        .get('/advisories/GHSA-cache-test-0001')
        .reply(200, mockGhsa)

      const result = await cacheFetchGhsa('GHSA-cache-test-0001')
      expect(result.ghsaId).toBe('GHSA-cache-test-0001')
    })
  })

  describe('JSON parsing error handling', () => {
    afterEach(() => {
      nock.cleanAll()
    })

    it('should throw descriptive error on malformed JSON response', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, 'not valid json{{{', {
          'Content-Type': 'application/json',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow(/Failed to parse GitHub API response/)
    })

    it('should throw descriptive error on incomplete JSON response', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, '{"name":"repo","owner":', {
          'Content-Type': 'application/json',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow(/Failed to parse GitHub API response/)
    })

    it('should throw descriptive error on truncated response', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, '{"name":', {
          'Content-Type': 'application/json',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow(/Failed to parse GitHub API response/)
    })

    it('should include URL in error message', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/special-repo')
        .reply(200, 'invalid json')

      try {
        await fetchGitHub('https://api.github.com/repos/owner/special-repo')
        expect.fail('Should have thrown an error')
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        expect((e as Error).message).toContain(
          'https://api.github.com/repos/owner/special-repo',
        )
      }
    })

    it('should handle binary responses gracefully', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, Buffer.from([0xff, 0xfe, 0x00, 0x01]), {
          'Content-Type': 'application/json',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow(/Failed to parse GitHub API response/)
    })
  })
})
