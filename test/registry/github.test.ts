/**
 * @fileoverview Tests for GitHub utilities.
 *
 * Note: HTTP-dependent tests are limited because httpRequest cannot be easily
 * mocked due to how modules are resolved when importing from src/. These tests
 * focus on environment variable handling, URL generation, and caching logic.
 */

import {
  clearRefCache,
  getGhsaUrl,
  getGitHubToken,
  getGitHubTokenFromGitConfig,
  getGitHubTokenWithFallback,
} from '@socketsecurity/lib/github'
import { beforeEach, describe, expect, it } from 'vitest'

describe('github', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.GITHUB_TOKEN
    delete process.env.GH_TOKEN
    delete process.env.SOCKET_CLI_GITHUB_TOKEN
    clearRefCache()
  })

  describe('getGitHubToken', () => {
    it('should return GITHUB_TOKEN from environment', () => {
      process.env.GITHUB_TOKEN = 'test-token'
      const token = getGitHubToken()
      expect(token).toBe('test-token')
    })

    it('should return GH_TOKEN from environment', () => {
      process.env.GH_TOKEN = 'gh-test-token'
      const token = getGitHubToken()
      expect(token).toBe('gh-test-token')
    })

    it('should return SOCKET_CLI_GITHUB_TOKEN from environment', () => {
      process.env.SOCKET_CLI_GITHUB_TOKEN = 'cli-token'
      const token = getGitHubToken()
      expect(token).toBe('cli-token')
    })

    it('should prefer GITHUB_TOKEN over GH_TOKEN', () => {
      process.env.GITHUB_TOKEN = 'github-token'
      process.env.GH_TOKEN = 'gh-token'
      const token = getGitHubToken()
      expect(token).toBe('github-token')
    })

    it('should prefer GITHUB_TOKEN over SOCKET_CLI_GITHUB_TOKEN', () => {
      process.env.GITHUB_TOKEN = 'github-token'
      process.env.SOCKET_CLI_GITHUB_TOKEN = 'cli-token'
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
      process.env.GITHUB_TOKEN = 'env-token'
      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('env-token')
    })

    it('should return token from GH_TOKEN when GITHUB_TOKEN is not set', async () => {
      process.env.GH_TOKEN = 'gh-token'
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
  })
})
