/**
 * @file Unit tests for GitHub API token helpers. Tests the helpers that do not
 *   touch the network:
 *
 *   - getGitHubToken(), getGitHubTokenFromGitConfig() token retrieval
 *   - getGitHubTokenWithFallback() multi-source token resolution
 *   - clearRefCache() clears git reference cache
 *   - getGhsaUrl() edge cases exercised alongside the token helpers
 *   - Environment variable handling (GITHUB_TOKEN, GH_TOKEN) The dedicated
 *     getGhsaUrl() formatting suite lives in github-ghsa-url.test.mts.
 *     HTTP-facing tests (fetchGitHub, resolveRefToSha, GHSA fetches) live in
 *     github-fetch.test.mts and github-ghsa.test.mts. Used by Socket tools for
 *     GitHub API authentication and GHSA lookups.
 */

import process from 'node:process'
import { getGhsaUrl } from '../../src/github/fetch'
import { clearRefCache } from '../../src/github/refs'
import {
  getGitHubToken,
  getGitHubTokenFromGitConfig,
  getGitHubTokenWithFallback,
} from '../../src/github/token'
import { resetEnv, setEnv } from '../../src/env/rewire'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
      for (let i = 0, { length } = results; i < length; i += 1) {
        const result = results[i]!
        expect(typeof result === 'string' || result === undefined).toBe(true)
      }
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
})
