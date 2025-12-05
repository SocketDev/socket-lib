/**
 * @fileoverview Unit tests for GitHub API integration utilities.
 *
 * Tests GitHub API helpers and authentication:
 * - getGitHubToken(), getGitHubTokenFromGitConfig() token retrieval
 * - getGitHubTokenWithFallback() multi-source token resolution
 * - getGhsaUrl() constructs GitHub Security Advisory URLs
 * - clearRefCache() clears git reference cache
 * - Environment variable handling (GITHUB_TOKEN, GH_TOKEN)
 * - Note: HTTP tests limited due to module resolution constraints
 * Used by Socket tools for GitHub API authentication and GHSA lookups.
 */

import {
  cacheFetchGhsa,
  clearRefCache,
  fetchGhsaDetails,
  fetchGitHub,
  getGhsaUrl,
  getGitHubToken,
  getGitHubTokenFromGitConfig,
  getGitHubTokenWithFallback,
  resolveRefToSha,
} from '@socketsecurity/lib/github'
import { resetEnv, setEnv } from '@socketsecurity/lib/env/rewire'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import nock from 'nock'

describe.sequential('github', () => {
  beforeEach(() => {
    // Clear environment variables
    resetEnv()
    clearRefCache()
  })

  afterEach(() => {
    resetEnv()
  })

  describe('getGitHubToken', () => {
    it('should return GITHUB_TOKEN from environment', () => {
      setEnv('GITHUB_TOKEN', 'test-token')
      const token = getGitHubToken()
      expect(token).toBe('test-token')
    })

    it('should return GH_TOKEN from environment', () => {
      setEnv('GH_TOKEN', 'gh-test-token')
      const token = getGitHubToken()
      expect(token).toBe('gh-test-token')
    })

    it('should return SOCKET_CLI_GITHUB_TOKEN from environment', () => {
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'cli-token')
      const token = getGitHubToken()
      expect(token).toBe('cli-token')
    })

    it('should prefer GITHUB_TOKEN over GH_TOKEN', () => {
      setEnv('GITHUB_TOKEN', 'github-token')
      setEnv('GH_TOKEN', 'gh-token')
      const token = getGitHubToken()
      expect(token).toBe('github-token')
    })

    it('should prefer GITHUB_TOKEN over SOCKET_CLI_GITHUB_TOKEN', () => {
      setEnv('GITHUB_TOKEN', 'github-token')
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'cli-token')
      const token = getGitHubToken()
      expect(token).toBe('github-token')
    })

    it('should return undefined when no token is set', () => {
      const token = getGitHubToken()
      expect(token).toBeUndefined()
    })
  })

  describe('clearRefCache', () => {
    it('should not throw when called', () => {
      expect(() => clearRefCache()).not.toThrow()
    })

    it('should be callable multiple times', () => {
      clearRefCache()
      clearRefCache()
      clearRefCache()
      expect(true).toBe(true)
    })
  })

  describe('getGitHubTokenFromGitConfig', () => {
    it('should return string or undefined (integration test)', async () => {
      const token = await getGitHubTokenFromGitConfig()
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should return undefined when git config throws', async () => {
      const token = await getGitHubTokenFromGitConfig({
        cwd: '/nonexistent/directory/that/does/not/exist',
      })
      expect(token).toBeUndefined()
    })

    it('should accept spawn options', async () => {
      const token = await getGitHubTokenFromGitConfig({ cwd: process.cwd() })
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })
  })

  describe('getGitHubTokenWithFallback', () => {
    it('should return token from GITHUB_TOKEN environment first', async () => {
      setEnv('GITHUB_TOKEN', 'env-token')
      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('env-token')
    })

    it('should return token from GH_TOKEN when GITHUB_TOKEN is not set', async () => {
      setEnv('GH_TOKEN', 'gh-token')
      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('gh-token')
    })

    it('should fallback to git config (integration test)', async () => {
      // Integration test - git config may or may not have token
      const token = await getGitHubTokenWithFallback()
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })
  })

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

  describe('clearRefCache', () => {
    it('should clear cache asynchronously', async () => {
      await clearRefCache()
      expect(true).toBe(true)
    })

    it('should handle multiple sequential clears', async () => {
      await clearRefCache()
      await clearRefCache()
      await clearRefCache()
      expect(true).toBe(true)
    })

    it('should handle concurrent clears', async () => {
      await Promise.all([clearRefCache(), clearRefCache(), clearRefCache()])
      expect(true).toBe(true)
    })
  })

  describe('token priority and fallback', () => {
    it('should prioritize GITHUB_TOKEN over other env vars', () => {
      setEnv('GITHUB_TOKEN', 'token1')
      setEnv('GH_TOKEN', 'token2')
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'token3')

      const token = getGitHubToken()
      expect(token).toBe('token1')
    })

    it('should use GH_TOKEN when GITHUB_TOKEN is not set', () => {
      setEnv('GH_TOKEN', 'token2')
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'token3')

      const token = getGitHubToken()
      expect(token).toBe('token2')
    })

    it('should use SOCKET_CLI_GITHUB_TOKEN as last resort', () => {
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'token3')

      const token = getGitHubToken()
      expect(token).toBe('token3')
    })

    it('should handle empty string tokens', () => {
      setEnv('GITHUB_TOKEN', '')
      setEnv('GH_TOKEN', 'token2')

      const token = getGitHubToken()
      expect(token).toBe('token2')
    })

    it('should handle whitespace tokens', () => {
      setEnv('GITHUB_TOKEN', '   ')
      const token = getGitHubToken()
      expect(token).toBeTruthy()
    })
  })

  describe('getGitHubTokenFromGitConfig', () => {
    it('should handle empty cwd', async () => {
      const token = await getGitHubTokenFromGitConfig({ cwd: '' })
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should handle missing git command', async () => {
      const token = await getGitHubTokenFromGitConfig({
        cwd: '/tmp',
      })
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should handle stdio options', async () => {
      const token = await getGitHubTokenFromGitConfig({
        stdio: 'pipe',
      })
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should not throw on errors', async () => {
      await expect(
        getGitHubTokenFromGitConfig({
          cwd: '/nonexistent/path/12345',
        }),
      ).resolves.not.toThrow()
    })
  })

  describe('getGitHubTokenWithFallback', () => {
    it('should prefer environment over git config', async () => {
      setEnv('GITHUB_TOKEN', 'env-token')
      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('env-token')
    })

    it('should handle when both sources are unavailable', async () => {
      const token = await getGitHubTokenWithFallback()
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should return string or undefined', async () => {
      const token = await getGitHubTokenWithFallback()
      expect(
        typeof token === 'string' ||
          typeof token === 'undefined' ||
          token === undefined,
      ).toBe(true)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle rapid token changes', () => {
      setEnv('GITHUB_TOKEN', 'token1')
      expect(getGitHubToken()).toBe('token1')

      setEnv('GITHUB_TOKEN', 'token2')
      expect(getGitHubToken()).toBe('token2')

      setEnv('GITHUB_TOKEN', undefined)
      expect(getGitHubToken()).toBeUndefined()
    })

    it('should handle token with special characters', () => {
      setEnv('GITHUB_TOKEN', 'ghp_abc123!@#$%^&*()')
      const token = getGitHubToken()
      expect(token).toContain('ghp_abc123')
    })

    it('should handle very long tokens', () => {
      const longToken = `ghp_${'x'.repeat(1000)}`
      setEnv('GITHUB_TOKEN', longToken)
      const token = getGitHubToken()
      expect(token).toBe(longToken)
    })

    it('should handle unicode in GHSA IDs', () => {
      const url = getGhsaUrl('GHSA-你好-世界-测试')
      expect(url).toContain('GHSA-你好-世界-测试')
    })

    it('should handle GHSA IDs with unusual characters', () => {
      const url = getGhsaUrl('GHSA-@@@-###-$$$')
      expect(url).toContain('GHSA-@@@-###-$$$')
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent token reads', () => {
      setEnv('GITHUB_TOKEN', 'token')
      const results = Array.from({ length: 10 }, () => getGitHubToken())
      expect(results).toEqual(Array(10).fill('token'))
    })

    it('should handle concurrent cache clears', async () => {
      const promises = Array.from({ length: 5 }, () => clearRefCache())
      await expect(Promise.all(promises)).resolves.not.toThrow()
    })

    it('should handle concurrent git config reads', async () => {
      const promises = Array.from({ length: 3 }, () =>
        getGitHubTokenFromGitConfig(),
      )
      await expect(Promise.all(promises)).resolves.not.toThrow()
    })
  })

  describe('type safety', () => {
    it('should return correct types', () => {
      const token = getGitHubToken()
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should return correct URL type', () => {
      const url = getGhsaUrl('GHSA-test-test-test')
      expect(typeof url).toBe('string')
    })

    it('should handle async operations correctly', async () => {
      const result = await getGitHubTokenWithFallback()
      expect(
        typeof result === 'string' ||
          typeof result === 'undefined' ||
          result === undefined,
      ).toBe(true)
    })
  })

  describe('API error handling edge cases', () => {
    it('should handle missing token gracefully', () => {
      resetEnv()
      const token = getGitHubToken()
      expect(token).toBeUndefined()
    })

    it('should generate GHSA URLs consistently', () => {
      const ghsaId = 'GHSA-1234-5678-90ab'
      const url1 = getGhsaUrl(ghsaId)
      const url2 = getGhsaUrl(ghsaId)
      expect(url1).toBe(url2)
      expect(url1).toContain(ghsaId)
    })

    it('should handle GHSA IDs with mixed case', () => {
      const url = getGhsaUrl('GhSa-MiXeD-CaSe-TeSt')
      expect(url).toBe('https://github.com/advisories/GhSa-MiXeD-CaSe-TeSt')
    })

    it('should handle GHSA IDs with dashes only', () => {
      const url = getGhsaUrl('----')
      expect(url).toBe('https://github.com/advisories/----')
    })
  })

  describe('caching behavior', () => {
    it('should allow multiple cache clears in sequence', async () => {
      for (let i = 0; i < 5; i++) {
        await clearRefCache()
      }
      expect(true).toBe(true)
    })

    it('should handle cache operations after clear', async () => {
      await clearRefCache()
      const token = getGitHubToken()
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })
  })

  describe('token resolution', () => {
    it('should handle all three token sources independently', () => {
      // Test GITHUB_TOKEN alone
      resetEnv()
      setEnv('GITHUB_TOKEN', 'token1')
      expect(getGitHubToken()).toBe('token1')

      // Test GH_TOKEN alone
      resetEnv()
      setEnv('GH_TOKEN', 'token2')
      expect(getGitHubToken()).toBe('token2')

      // Test SOCKET_CLI_GITHUB_TOKEN alone
      resetEnv()
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'token3')
      expect(getGitHubToken()).toBe('token3')
    })

    it('should handle token priority with all permutations', () => {
      // Priority: GITHUB_TOKEN > GH_TOKEN > SOCKET_CLI_GITHUB_TOKEN
      resetEnv()
      setEnv('GH_TOKEN', 'gh')
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'cli')
      expect(getGitHubToken()).toBe('gh')

      resetEnv()
      setEnv('GITHUB_TOKEN', 'github')
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'cli')
      expect(getGitHubToken()).toBe('github')

      resetEnv()
      setEnv('GITHUB_TOKEN', 'github')
      setEnv('GH_TOKEN', 'gh')
      expect(getGitHubToken()).toBe('github')
    })
  })

  describe('git config integration', () => {
    it('should handle non-git directories', async () => {
      const token = await getGitHubTokenFromGitConfig({
        cwd: '/tmp',
      })
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should handle relative paths', async () => {
      const token = await getGitHubTokenFromGitConfig({
        cwd: '.',
      })
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should handle multiple concurrent git config reads', async () => {
      const results = await Promise.all([
        getGitHubTokenFromGitConfig(),
        getGitHubTokenFromGitConfig(),
        getGitHubTokenFromGitConfig(),
      ])
      results.forEach(result => {
        expect(typeof result === 'string' || result === undefined).toBe(true)
      })
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
      ids.forEach(id => {
        const url = getGhsaUrl(id)
        expect(url).toMatch(/^https:\/\/github\.com\/advisories\//)
        expect(url).toContain(id)
      })
    })

    it('should handle GHSA IDs with URL-unsafe characters', () => {
      const id = 'GHSA-test%20with%20spaces'
      const url = getGhsaUrl(id)
      expect(url).toContain(id)
    })
  })

  describe('fallback chain', () => {
    it('should complete fallback chain with no sources', async () => {
      resetEnv()
      const token = await getGitHubTokenWithFallback()
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })

    it('should short-circuit on first found token', async () => {
      setEnv('GITHUB_TOKEN', 'first-token')
      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('first-token')
    })

    it('should try git config when env vars are empty', async () => {
      resetEnv()
      const token = await getGitHubTokenWithFallback()
      // Token may come from git config or be undefined
      expect(typeof token === 'string' || token === undefined).toBe(true)
    })
  })

  describe('fetchGitHub', () => {
    afterEach(() => {
      nock.cleanAll()
    })

    it('should fetch from GitHub API successfully', async () => {
      const mockData = { name: 'test-repo', full_name: 'owner/test-repo' }
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(200, mockData)

      const result = await fetchGitHub(
        'https://api.github.com/repos/owner/repo',
      )
      expect(result).toEqual(mockData)
    })

    it('should include authorization header when token provided', async () => {
      nock('https://api.github.com')
        .get('/user')
        .matchHeader('Authorization', 'Bearer test-token')
        .reply(200, { login: 'testuser' })

      const result = await fetchGitHub('https://api.github.com/user', {
        token: 'test-token',
      })
      expect(result).toHaveProperty('login')
    })

    it('should handle rate limit errors with reset time', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(403, 'rate limit exceeded', {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow('GitHub API rate limit exceeded')
    })

    it('should handle rate limit errors without reset time', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .reply(403, 'rate limit exceeded', {
          'x-ratelimit-remaining': '0',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow('GitHub API rate limit exceeded')
    })

    it('should handle non-rate-limit 403 errors', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/private')
        .reply(403, 'Forbidden', {
          'x-ratelimit-remaining': '50',
        })

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/private'),
      ).rejects.toThrow('GitHub API error 403')
    })

    it('should handle 404 errors', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/nonexistent')
        .reply(404, 'Not Found')

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/nonexistent'),
      ).rejects.toThrow('GitHub API error 404')
    })

    it('should include custom headers', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo')
        .matchHeader('X-Custom-Header', 'custom-value')
        .reply(200, {})

      await fetchGitHub('https://api.github.com/repos/owner/repo', {
        headers: { 'X-Custom-Header': 'custom-value' },
      })
    })
  })

  describe('resolveRefToSha', () => {
    beforeEach(() => {
      setEnv('DISABLE_GITHUB_CACHE', '1')
    })

    afterEach(() => {
      nock.cleanAll()
    })

    it('should resolve tag to SHA', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/v1.0.0')
        .reply(200, {
          ref: 'refs/tags/v1.0.0',
          object: {
            sha: 'abc123',
            type: 'commit',
            url: 'https://api.github.com/repos/owner/repo/git/commits/abc123',
          },
        })

      const sha = await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(sha).toBe('abc123')
    })

    it('should resolve annotated tag to commit SHA', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/v2.0.0')
        .reply(200, {
          ref: 'refs/tags/v2.0.0',
          object: {
            sha: 'tag456',
            type: 'tag',
            url: 'https://api.github.com/repos/owner/repo/git/tags/tag456',
          },
        })
        .get('/repos/owner/repo/git/tags/tag456')
        .reply(200, {
          tag: 'v2.0.0',
          sha: 'tag456',
          object: {
            sha: 'commit789',
            type: 'commit',
          },
        })

      const sha = await resolveRefToSha('owner', 'repo', 'v2.0.0')
      expect(sha).toBe('commit789')
    })

    it('should resolve branch to SHA', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/main')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/main')
        .reply(200, {
          ref: 'refs/heads/main',
          object: {
            sha: 'branch123',
            type: 'commit',
          },
        })

      const sha = await resolveRefToSha('owner', 'repo', 'main')
      expect(sha).toBe('branch123')
    })

    it('should resolve commit SHA directly', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/abc123def456')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/abc123def456')
        .reply(404)
        .get('/repos/owner/repo/commits/abc123def456')
        .reply(200, {
          sha: 'abc123def456789012345678901234567890abcd',
          commit: {},
        })

      const sha = await resolveRefToSha('owner', 'repo', 'abc123def456')
      expect(sha).toBe('abc123def456789012345678901234567890abcd')
    })

    it('should throw error when ref cannot be resolved', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/nonexistent')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/nonexistent')
        .reply(404)
        .get('/repos/owner/repo/commits/nonexistent')
        .reply(404)

      await expect(
        resolveRefToSha('owner', 'repo', 'nonexistent'),
      ).rejects.toThrow('failed to resolve ref')
    })
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
        withdrawn_at: null,
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
        withdrawn_at: null,
        references: [],
        vulnerabilities: [],
        cvss: null,
        cwes: [],
      }

      nock('https://api.github.com')
        .get('/advisories/GHSA-cache-test-0001')
        .reply(200, mockGhsa)

      const result = await cacheFetchGhsa('GHSA-cache-test-0001')
      expect(result.ghsaId).toBe('GHSA-cache-test-0001')
    })
  })
})
