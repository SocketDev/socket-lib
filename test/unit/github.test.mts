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

import process from 'node:process'
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

    it('should be callable multiple times without throwing', () => {
      expect(() => {
        clearRefCache()
        clearRefCache()
        clearRefCache()
      }).not.toThrow()
    })
  })

  describe('getGitHubTokenFromGitConfig', () => {
    it('should return string or undefined (integration test)', async () => {
      await getGitHubTokenFromGitConfig()
      // Assertion is that await did not throw — return value is string|undefined by contract.
    })

    it('should return undefined when git config throws', async () => {
      const token = await getGitHubTokenFromGitConfig({
        cwd: '/nonexistent/directory/that/does/not/exist',
      })
      expect(token).toBeUndefined()
    })

    it('should accept spawn options', async () => {
      await getGitHubTokenFromGitConfig({ cwd: process.cwd() })
      // Assertion is that await did not throw — return value is string|undefined by contract.
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
      await getGitHubTokenWithFallback()
      // Assertion is that await did not throw — return value is string|undefined by contract.
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
    it('should clear cache asynchronously without throwing', async () => {
      await expect(clearRefCache()).resolves.not.toThrow()
    })

    it('should handle multiple sequential clears', async () => {
      await expect(
        (async () => {
          await clearRefCache()
          await clearRefCache()
          await clearRefCache()
        })(),
      ).resolves.not.toThrow()
    })

    it('should handle concurrent clears', async () => {
      await expect(
        Promise.all([clearRefCache(), clearRefCache(), clearRefCache()]),
      ).resolves.toBeDefined()
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

    it('should not trim whitespace-only tokens (pass-through)', () => {
      // getGitHubToken() does env1 || env2 || env3 — no trimming. A
      // whitespace-only value is truthy and returned verbatim. This
      // documents the no-trim behavior rather than just asserting JS
      // truthiness of '   ' (which is trivially true).
      setEnv('GITHUB_TOKEN', '   ')
      expect(getGitHubToken()).toBe('   ')
    })
  })

  describe('getGitHubTokenFromGitConfig', () => {
    it('should handle empty cwd', async () => {
      await getGitHubTokenFromGitConfig({ cwd: '' })
      // Assertion is that await did not throw — return value is string|undefined by contract.
    })

    it('should handle missing git command', async () => {
      await getGitHubTokenFromGitConfig({
        cwd: '/tmp',
      })
      // Assertion is that await did not throw — return value is string|undefined by contract.
    })

    it('should handle stdio options', async () => {
      await getGitHubTokenFromGitConfig({
        stdio: 'pipe',
      })
      // Assertion is that await did not throw — return value is string|undefined by contract.
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
      await getGitHubTokenWithFallback()
      // Assertion is that await did not throw — return value is string|undefined by contract.
    })

    it('should return string or undefined', async () => {
      await getGitHubTokenWithFallback()
      // Assertion is that await did not throw — return value is string|undefined by contract.
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
      // Return type string|undefined is enforced by TS; runtime-only
      // assertion is that the call doesn't throw on a fresh env.
      expect(() => getGitHubToken()).not.toThrow()
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
    it('multiple cache clears in sequence run without throwing', async () => {
      await expect(
        (async () => {
          for (let i = 0; i < 5; i++) {
            await clearRefCache()
          }
        })(),
      ).resolves.not.toThrow()
    })

    it('should handle cache operations after clear', async () => {
      await clearRefCache()
      expect(() => getGitHubToken()).not.toThrow()
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
      await getGitHubTokenFromGitConfig({
        cwd: '/tmp',
      })
      // Assertion is that await did not throw — return value is string|undefined by contract.
    })

    it('should handle relative paths', async () => {
      await getGitHubTokenFromGitConfig({
        cwd: '.',
      })
      // Assertion is that await did not throw — return value is string|undefined by contract.
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
      await getGitHubTokenWithFallback()
      // Assertion is that await did not throw — return value is string|undefined by contract.
    })

    it('should short-circuit on first found token', async () => {
      setEnv('GITHUB_TOKEN', 'first-token')
      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('first-token')
    })

    it('should try git config when env vars are empty', async () => {
      resetEnv()
      // Token may come from git config or be undefined; the behaviour
      // under test is 'does not throw when env vars are missing'.
      await expect(getGitHubTokenWithFallback()).resolves.not.toThrow()
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

    it('should throw GitHubEmptyBodyError on 200 + zero-byte body', async () => {
      // The documented GitHub-search-degraded incident shape: REST
      // returns HTTP 200 OK with a body of 0 bytes (no error code,
      // no Retry-After, no rate-limit signal). Without a typed
      // error, callers parse '' and throw a confusing SyntaxError;
      // the typed error gives downstream callers a single
      // `instanceof` check to switch on for fallback transports.
      nock('https://api.github.com').get('/repos/owner/repo').reply(200, '')

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow(/empty body/)
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

    it('should fall back to GraphQL when REST returns 200 + empty body', async () => {
      // GitHub Elasticsearch incident shape — REST endpoints across
      // the API surface return HTTP 200 with zero-byte bodies. The
      // tier cascade (tag → branch → commit) detects this via the
      // typed `GitHubEmptyBodyError` and routes the lookup through
      // GraphQL `repository.ref(qualifiedName)` which uses a
      // different backend. Uses a unique ref name to avoid colliding
      // with the resolveRefToSha cache populated by prior tests
      // (clearRefCache is not awaited in the outer beforeEach).
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-tag-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-tag-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-tag-via-graphql')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: {
                target: {
                  __typename: 'Commit',
                  oid: 'graphql-commit-sha-aaa',
                },
              },
              branchRef: null,
              commit: null,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'incident-tag-via-graphql',
      )
      expect(sha).toBe('graphql-commit-sha-aaa')
    })

    it('should resolve annotated tags via GraphQL fallback', async () => {
      // Annotated tags wrap a Commit inside a Tag; in REST this needs
      // a second lookup against `tagData.object.url`. GraphQL returns
      // both in a single query — `Tag.target.oid` is the commit SHA.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-annotated-tag')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-annotated-tag')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-annotated-tag')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: {
                target: {
                  __typename: 'Tag',
                  target: { oid: 'annotated-commit-sha-bbb' },
                },
              },
              branchRef: null,
              commit: null,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'incident-annotated-tag',
      )
      expect(sha).toBe('annotated-commit-sha-bbb')
    })

    it('should resolve branches via GraphQL fallback when REST is empty', async () => {
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-branch-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-branch-via-graphql')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-branch-via-graphql')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: null,
              branchRef: { target: { oid: 'branch-head-sha-ccc' } },
              commit: null,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'incident-branch-via-graphql',
      )
      expect(sha).toBe('branch-head-sha-ccc')
    })

    it('should NOT fall back to GraphQL when REST cascade hits genuine 404s', async () => {
      // Real 404s (the ref genuinely doesn't exist as a tag, branch,
      // or commit) must NOT trigger the GraphQL fallback. The
      // fallback is reserved for the documented incident shape
      // (200 + empty body); a 404-throughout cascade should produce
      // the standard "ref not found" error without any GraphQL
      // round trip. We use nock with no `.post('/graphql')` mock —
      // if the code DID call GraphQL, nock would fail loudly with
      // "no match for request".
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/genuinely-missing-ref')
        .reply(404)
        .get('/repos/owner/repo/git/refs/heads/genuinely-missing-ref')
        .reply(404)
        .get('/repos/owner/repo/commits/genuinely-missing-ref')
        .reply(404)

      await expect(
        resolveRefToSha('owner', 'repo', 'genuinely-missing-ref'),
      ).rejects.toThrow('failed to resolve ref')
    })

    it('should re-throw original REST error when GraphQL fallback also fails', async () => {
      // Both transports degraded: REST hits empty bodies all the way
      // through the cascade, GraphQL returns a non-OK status. The
      // helper should swallow the GraphQL transport error and
      // surface the REST cascade's 'failed to resolve ref' message
      // — that's more actionable for the user than a confusing
      // GraphQL-side error caused by the same incident.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/double-failure-ref')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/double-failure-ref')
        .reply(200, '')
        .get('/repos/owner/repo/commits/double-failure-ref')
        .reply(200, '')
        .post('/graphql')
        .reply(503, 'graphql unavailable')

      await expect(
        resolveRefToSha('owner', 'repo', 'double-failure-ref'),
      ).rejects.toThrow('failed to resolve ref')
    })

    it('should return null from GraphQL when ref not found anywhere', async () => {
      // GraphQL ran successfully but all three aliases (tagRef,
      // branchRef, commit) came back null — the ref legitimately
      // doesn't exist. Caller falls back to the REST error message.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/incident-but-real-404')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/incident-but-real-404')
        .reply(200, '')
        .get('/repos/owner/repo/commits/incident-but-real-404')
        .reply(200, '')
        .post('/graphql')
        .reply(200, {
          data: {
            repository: {
              tagRef: null,
              branchRef: null,
              commit: null,
            },
          },
        })

      await expect(
        resolveRefToSha('owner', 'repo', 'incident-but-real-404'),
      ).rejects.toThrow('failed to resolve ref')
    })

    it('should forward auth token to GraphQL fallback', async () => {
      // The user-provided token must be threaded through to the
      // GraphQL POST as a Bearer auth header — GraphQL queries to
      // private repos require auth even when REST anonymous works.
      nock('https://api.github.com')
        .get('/repos/owner/repo/git/refs/tags/auth-forwarding-ref')
        .reply(200, '')
        .get('/repos/owner/repo/git/refs/heads/auth-forwarding-ref')
        .reply(200, '')
        .get('/repos/owner/repo/commits/auth-forwarding-ref')
        .reply(200, '')
        .post('/graphql')
        .matchHeader('Authorization', 'Bearer custom-token-xyz')
        .reply(200, {
          data: {
            repository: {
              tagRef: {
                target: { __typename: 'Commit', oid: 'auth-sha-ddd' },
              },
              branchRef: null,
              commit: null,
            },
          },
        })

      const sha = await resolveRefToSha(
        'owner',
        'repo',
        'auth-forwarding-ref',
        { token: 'custom-token-xyz' },
      )
      expect(sha).toBe('auth-sha-ddd')
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
              withdrawnAt: null,
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
        .reply(200, { data: { securityAdvisory: null } })

      await expect(fetchGhsaDetails('GHSA-graphql-null-xx')).rejects.toThrow(
        'GHSA-graphql-null-xx not found via GraphQL',
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
        'Field "securityAdvisory" requires authorization',
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
              withdrawnAt: null,
              cvss: null,
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
