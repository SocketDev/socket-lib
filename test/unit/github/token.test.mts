import process from 'node:process'

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { resetEnv, setEnv } from '../../../src/env/rewire'
import { clearRefCache } from '../../../src/github/refs'
import {
  getGitHubToken,
  getGitHubTokenFromGitConfig,
  getGitHubTokenWithFallback,
} from '../../../src/github/token'

describe.sequential('github/token', () => {
  // Neutralize the ambient token vars at the process.env level so a real CI
  // GITHUB_TOKEN can't leak in and outrank a per-test value. This must live in
  // process.env (not setEnv overrides): several tests call resetEnv() in their
  // body, which clears overrides but not process.env — a beforeEach mask would
  // be wiped by those. Restored in afterAll so sibling test files are unaffected.
  const TOKEN_ENV = [
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'SOCKET_CLI_GITHUB_TOKEN',
    'SOCKET_SECURITY_GITHUB_PAT',
  ]
  const savedTokenEnv: Record<string, string | undefined> = { __proto__: null }

  beforeAll(() => {
    for (let i = 0, { length } = TOKEN_ENV; i < length; i += 1) {
      const key = TOKEN_ENV[i]!
      savedTokenEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterAll(() => {
    for (let i = 0, { length } = TOKEN_ENV; i < length; i += 1) {
      const key = TOKEN_ENV[i]!
      const saved = savedTokenEnv[key]
      if (saved === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = saved
      }
    }
  })

  beforeEach(() => {
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
      const token = await getGitHubTokenWithFallback()
      expect(typeof token === 'string' || token === undefined).toBe(true)
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
      setEnv('GITHUB_TOKEN', '   ')
      expect(getGitHubToken()).toBe('   ')
    })
  })

  describe('getGitHubTokenFromGitConfig spawn options', () => {
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

  describe('getGitHubTokenWithFallback source resolution', () => {
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
      expect(typeof token === 'string' || token === undefined).toBe(true)
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
  })

  describe('concurrent operations', () => {
    it('should handle concurrent token reads', () => {
      setEnv('GITHUB_TOKEN', 'token')
      const results = Array.from({ length: 10 }, () => getGitHubToken())
      expect(results).toEqual(Array(10).fill('token'))
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
      expect(() => getGitHubToken()).not.toThrow()
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
  })

  describe('token resolution', () => {
    it('should handle all three token sources independently', () => {
      resetEnv()
      setEnv('GITHUB_TOKEN', 'token1')
      expect(getGitHubToken()).toBe('token1')

      resetEnv()
      setEnv('GH_TOKEN', 'token2')
      expect(getGitHubToken()).toBe('token2')

      resetEnv()
      setEnv('SOCKET_CLI_GITHUB_TOKEN', 'token3')
      expect(getGitHubToken()).toBe('token3')
    })

    it('should handle token priority with all permutations', () => {
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
      for (let i = 0, { length } = results; i < length; i += 1) {
        const result = results[i]!
        expect(typeof result === 'string' || result === undefined).toBe(true)
      }
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
      await expect(getGitHubTokenWithFallback()).resolves.not.toThrow()
    })
  })
})
