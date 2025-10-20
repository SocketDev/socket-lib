/**
 * @fileoverview Unit tests for GitHub utilities.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Create mock functions using vi.hoisted to ensure they exist before module imports
const { mockHttpRequest, mockSpawn } = vi.hoisted(() => ({
  mockHttpRequest: vi.fn(),
  mockSpawn: vi.fn(),
}))

// Mock modules - must match how github.ts imports them
vi.mock('../../src/http-request', () => ({
  httpRequest: mockHttpRequest,
}))

vi.mock('../../src/spawn', () => ({
  spawn: mockSpawn,
}))

// Now import after mocking
import type {
  GhsaDetails,
  GitHubCommit,
  GitHubRateLimitError,
  GitHubRef,
  GitHubTag,
} from '@socketsecurity/lib/github'
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

describe('github', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear environment variables
    delete process.env['GITHUB_TOKEN']
    delete process.env['GH_TOKEN']
    delete process.env['SOCKET_CLI_GITHUB_TOKEN']
    delete process.env['DISABLE_GITHUB_CACHE']
  })

  describe('getGitHubToken', () => {
    it('should return GITHUB_TOKEN from environment', () => {
      process.env['GITHUB_TOKEN'] = 'token-from-github-token'
      expect(getGitHubToken()).toBe('token-from-github-token')
    })

    it('should return GH_TOKEN if GITHUB_TOKEN not set', () => {
      process.env['GH_TOKEN'] = 'token-from-gh-token'
      expect(getGitHubToken()).toBe('token-from-gh-token')
    })

    it('should return SOCKET_CLI_GITHUB_TOKEN if others not set', () => {
      process.env['SOCKET_CLI_GITHUB_TOKEN'] = 'token-from-socket-cli'
      expect(getGitHubToken()).toBe('token-from-socket-cli')
    })

    it('should prioritize GITHUB_TOKEN over others', () => {
      process.env['GITHUB_TOKEN'] = 'token-from-github-token'
      process.env['GH_TOKEN'] = 'token-from-gh-token'
      process.env['SOCKET_CLI_GITHUB_TOKEN'] = 'token-from-socket-cli'
      expect(getGitHubToken()).toBe('token-from-github-token')
    })

    it('should prioritize GH_TOKEN over SOCKET_CLI_GITHUB_TOKEN', () => {
      process.env['GH_TOKEN'] = 'token-from-gh-token'
      process.env['SOCKET_CLI_GITHUB_TOKEN'] = 'token-from-socket-cli'
      expect(getGitHubToken()).toBe('token-from-gh-token')
    })

    it('should return undefined when no token is set', () => {
      expect(getGitHubToken()).toBeUndefined()
    })
  })

  describe('fetchGitHub', () => {
    it('should make successful API request with default headers', async () => {
      const mockResponse = {
        body: Buffer.from(JSON.stringify({ data: 'test' })),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      const result = await fetchGitHub<{ data: string }>(
        'https://api.github.com/repos/owner/repo',
      )

      expect(result).toEqual({ data: 'test' })
      expect(mockHttpRequest).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'socket-registry-github-client',
          },
        },
      )
    })

    it('should include token in Authorization header when provided', async () => {
      const mockResponse = {
        body: Buffer.from(JSON.stringify({ data: 'test' })),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      await fetchGitHub('https://api.github.com/repos/owner/repo', {
        token: 'test-token',
      })

      expect(mockHttpRequest).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'Bearer test-token',
            'User-Agent': 'socket-registry-github-client',
          },
        },
      )
    })

    it('should use token from environment if not provided', async () => {
      process.env['GITHUB_TOKEN'] = 'env-token'
      const mockResponse = {
        body: Buffer.from(JSON.stringify({ data: 'test' })),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      await fetchGitHub('https://api.github.com/repos/owner/repo')

      expect(mockHttpRequest).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            Authorization: 'Bearer env-token',
            'User-Agent': 'socket-registry-github-client',
          },
        },
      )
    })

    it('should merge custom headers with default headers', async () => {
      const mockResponse = {
        body: Buffer.from(JSON.stringify({ data: 'test' })),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      await fetchGitHub('https://api.github.com/repos/owner/repo', {
        headers: { 'X-Custom': 'value' },
      })

      expect(mockHttpRequest).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'socket-registry-github-client',
            'X-Custom': 'value',
          },
        },
      )
    })

    it('should throw error for non-ok responses', async () => {
      const mockResponse = {
        body: Buffer.from(''),
        headers: {},
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow('GitHub API error 404: Not Found')
    })

    it('should throw rate limit error when rate limit is exceeded', async () => {
      const mockResponse = {
        body: Buffer.from(''),
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1234567890',
        },
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      try {
        await fetchGitHub('https://api.github.com/repos/owner/repo')
        expect.fail('Should have thrown error')
      } catch (e) {
        const error = e as GitHubRateLimitError
        expect(error.message).toContain('GitHub API rate limit exceeded')
        expect(error.message).toContain('GITHUB_TOKEN')
        expect(error.status).toBe(403)
        expect(error.resetTime).toBeInstanceOf(Date)
      }
    })

    it('should handle rate limit header as array', async () => {
      const mockResponse = {
        body: Buffer.from(''),
        headers: {
          'x-ratelimit-remaining': ['0'],
          'x-ratelimit-reset': ['1234567890'],
        },
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      try {
        await fetchGitHub('https://api.github.com/repos/owner/repo')
        expect.fail('Should have thrown error')
      } catch (e) {
        const error = e as GitHubRateLimitError
        expect(error.message).toContain('GitHub API rate limit exceeded')
        expect(error.status).toBe(403)
      }
    })

    it('should throw regular error for 403 without rate limit', async () => {
      const mockResponse = {
        body: Buffer.from(''),
        headers: {},
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      await expect(
        fetchGitHub('https://api.github.com/repos/owner/repo'),
      ).rejects.toThrow('GitHub API error 403: Forbidden')
    })

    it('should handle rate limit error without reset time', async () => {
      const mockResponse = {
        body: Buffer.from(''),
        headers: {
          'x-ratelimit-remaining': '0',
        },
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      }
      mockHttpRequest.mockResolvedValue(mockResponse)

      try {
        await fetchGitHub('https://api.github.com/repos/owner/repo')
        expect.fail('Should have thrown error')
      } catch (e) {
        const error = e as GitHubRateLimitError
        expect(error.message).toContain('GitHub API rate limit exceeded')
        expect(error.resetTime).toBeUndefined()
      }
    })
  })

  describe('resolveRefToSha', () => {
    beforeEach(async () => {
      // Clear cache before each test
      await clearRefCache()
    })

    it('should resolve a tag to SHA', async () => {
      const tagRef: GitHubRef = {
        object: {
          sha: 'abc123',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/abc123',
        },
        ref: 'refs/tags/v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/refs/tags/v1.0.0',
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(tagRef)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const sha = await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(sha).toBe('abc123')
    })

    it('should resolve an annotated tag to SHA', async () => {
      const tagRef: GitHubRef = {
        object: {
          sha: 'tag-object-sha',
          type: 'tag',
          url: 'https://api.github.com/repos/owner/repo/git/tags/tag-object-sha',
        },
        ref: 'refs/tags/v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/refs/tags/v1.0.0',
      }

      const tagObject: GitHubTag = {
        message: 'Release v1.0.0',
        object: {
          sha: 'commit-sha',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/commit-sha',
        },
        sha: 'tag-object-sha',
        tag: 'v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/tags/tag-object-sha',
      }

      mockHttpRequest
        .mockResolvedValueOnce({
          body: Buffer.from(JSON.stringify(tagRef)),
          headers: {},
          ok: true,
          status: 200,
          statusText: 'OK',
        })
        .mockResolvedValueOnce({
          body: Buffer.from(JSON.stringify(tagObject)),
          headers: {},
          ok: true,
          status: 200,
          statusText: 'OK',
        })

      const sha = await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(sha).toBe('commit-sha')
    })

    it('should resolve a branch to SHA', async () => {
      const branchRef: GitHubRef = {
        object: {
          sha: 'branch-sha',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/branch-sha',
        },
        ref: 'refs/heads/main',
        url: 'https://api.github.com/repos/owner/repo/git/refs/heads/main',
      }

      mockHttpRequest
        .mockRejectedValueOnce(new Error('Not a tag'))
        .mockResolvedValueOnce({
          body: Buffer.from(JSON.stringify(branchRef)),
          headers: {},
          ok: true,
          status: 200,
          statusText: 'OK',
        })

      const sha = await resolveRefToSha('owner', 'repo', 'main')
      expect(sha).toBe('branch-sha')
    })

    it('should resolve a commit SHA', async () => {
      const commit: GitHubCommit = {
        commit: {
          author: {
            date: '2023-01-01T00:00:00Z',
            email: 'user@example.com',
            name: 'User',
          },
          message: 'Commit message',
        },
        sha: 'full-commit-sha',
        url: 'https://api.github.com/repos/owner/repo/commits/full-commit-sha',
      }

      mockHttpRequest
        .mockRejectedValueOnce(new Error('Not a tag'))
        .mockRejectedValueOnce(new Error('Not a branch'))
        .mockResolvedValueOnce({
          body: Buffer.from(JSON.stringify(commit)),
          headers: {},
          ok: true,
          status: 200,
          statusText: 'OK',
        })

      const sha = await resolveRefToSha('owner', 'repo', 'abc123')
      expect(sha).toBe('full-commit-sha')
    })

    it('should throw error when ref cannot be resolved', async () => {
      mockHttpRequest
        .mockRejectedValueOnce(new Error('Not a tag'))
        .mockRejectedValueOnce(new Error('Not a branch'))
        .mockRejectedValueOnce(new Error('Not a commit'))

      await expect(
        resolveRefToSha('owner', 'repo', 'invalid-ref'),
      ).rejects.toThrow('failed to resolve ref "invalid-ref" for owner/repo')
    })

    it('should use cache for repeated calls', async () => {
      const tagRef: GitHubRef = {
        object: {
          sha: 'cached-sha',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/cached-sha',
        },
        ref: 'refs/tags/v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/refs/tags/v1.0.0',
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(tagRef)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const sha1 = await resolveRefToSha('owner', 'repo', 'v1.0.0')
      const sha2 = await resolveRefToSha('owner', 'repo', 'v1.0.0')

      expect(sha1).toBe('cached-sha')
      expect(sha2).toBe('cached-sha')
      // Should only make one API call due to caching
      expect(mockHttpRequest).toHaveBeenCalledTimes(1)
    })

    it('should bypass cache when DISABLE_GITHUB_CACHE is set', async () => {
      process.env['DISABLE_GITHUB_CACHE'] = '1'

      const tagRef: GitHubRef = {
        object: {
          sha: 'no-cache-sha',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/no-cache-sha',
        },
        ref: 'refs/tags/v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/refs/tags/v1.0.0',
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(tagRef)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const sha1 = await resolveRefToSha('owner', 'repo', 'v1.0.0')
      const sha2 = await resolveRefToSha('owner', 'repo', 'v1.0.0')

      expect(sha1).toBe('no-cache-sha')
      expect(sha2).toBe('no-cache-sha')
      // Should make two API calls when cache is disabled
      expect(mockHttpRequest).toHaveBeenCalledTimes(2)
    })

    it('should pass token to fetch operations', async () => {
      const tagRef: GitHubRef = {
        object: {
          sha: 'token-sha',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/token-sha',
        },
        ref: 'refs/tags/v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/refs/tags/v1.0.0',
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(tagRef)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      await resolveRefToSha('owner', 'repo', 'v1.0.0', {
        token: 'custom-token',
      })

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-token',
          }),
        }),
      )
    })
  })

  describe('clearRefCache', () => {
    it('should clear the cache', async () => {
      const tagRef: GitHubRef = {
        object: {
          sha: 'clear-test-sha',
          type: 'commit',
          url: 'https://api.github.com/repos/owner/repo/git/commits/clear-test-sha',
        },
        ref: 'refs/tags/v1.0.0',
        url: 'https://api.github.com/repos/owner/repo/git/refs/tags/v1.0.0',
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(tagRef)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      // First call
      await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(mockHttpRequest).toHaveBeenCalledTimes(1)

      // Second call should use cache
      await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(mockHttpRequest).toHaveBeenCalledTimes(1)

      // Clear cache
      await clearRefCache()

      // Third call should fetch again
      await resolveRefToSha('owner', 'repo', 'v1.0.0')
      expect(mockHttpRequest).toHaveBeenCalledTimes(2)
    })

    it('should not throw when cache is not initialized', async () => {
      await expect(clearRefCache()).resolves.not.toThrow()
    })
  })

  describe('getGitHubTokenFromGitConfig', () => {
    it('should return token from git config', async () => {
      mockSpawn.mockResolvedValue({
        code: 0,
        signal: null,
        stderr: Buffer.from(''),
        stdout: Buffer.from('git-config-token\n'),
      })

      const token = await getGitHubTokenFromGitConfig()
      expect(token).toBe('git-config-token')
      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['config', 'github.token'],
        expect.objectContaining({ stdio: 'pipe' }),
      )
    })

    it('should trim whitespace from git config token', async () => {
      mockSpawn.mockResolvedValue({
        code: 0,
        signal: null,
        stderr: Buffer.from(''),
        stdout: Buffer.from('  token-with-spaces  \n'),
      })

      const token = await getGitHubTokenFromGitConfig()
      expect(token).toBe('token-with-spaces')
    })

    it('should return undefined when git config fails', async () => {
      mockSpawn.mockResolvedValue({
        code: 1,
        signal: null,
        stderr: Buffer.from('error'),
        stdout: Buffer.from(''),
      })

      const token = await getGitHubTokenFromGitConfig()
      expect(token).toBeUndefined()
    })

    it('should return undefined when stdout is empty', async () => {
      mockSpawn.mockResolvedValue({
        code: 0,
        signal: null,
        stderr: Buffer.from(''),
        stdout: Buffer.from(''),
      })

      const token = await getGitHubTokenFromGitConfig()
      expect(token).toBeUndefined()
    })

    it('should return undefined when spawn throws', async () => {
      mockSpawn.mockRejectedValue(new Error('spawn error'))

      const token = await getGitHubTokenFromGitConfig()
      expect(token).toBeUndefined()
    })

    it('should pass spawn options through', async () => {
      mockSpawn.mockResolvedValue({
        code: 0,
        signal: null,
        stderr: Buffer.from(''),
        stdout: Buffer.from('token\n'),
      })

      await getGitHubTokenFromGitConfig({ cwd: '/custom/path' })

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['config', 'github.token'],
        expect.objectContaining({
          cwd: '/custom/path',
          stdio: 'pipe',
        }),
      )
    })
  })

  describe('getGitHubTokenWithFallback', () => {
    it('should return token from environment first', async () => {
      process.env['GITHUB_TOKEN'] = 'env-token'
      mockSpawn.mockResolvedValue({
        code: 0,
        signal: null,
        stderr: Buffer.from(''),
        stdout: Buffer.from('git-token\n'),
      })

      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('env-token')
      // Should not call git config
      expect(mockSpawn).not.toHaveBeenCalled()
    })

    it('should fallback to git config when environment is empty', async () => {
      mockSpawn.mockResolvedValue({
        code: 0,
        signal: null,
        stderr: Buffer.from(''),
        stdout: Buffer.from('git-token\n'),
      })

      const token = await getGitHubTokenWithFallback()
      expect(token).toBe('git-token')
      expect(mockSpawn).toHaveBeenCalled()
    })

    it('should return undefined when both sources fail', async () => {
      mockSpawn.mockResolvedValue({
        code: 1,
        signal: null,
        stderr: Buffer.from('error'),
        stdout: Buffer.from(''),
      })

      const token = await getGitHubTokenWithFallback()
      expect(token).toBeUndefined()
    })
  })

  describe('getGhsaUrl', () => {
    it('should generate correct GHSA URL', () => {
      expect(getGhsaUrl('GHSA-1234-5678-90ab')).toBe(
        'https://github.com/advisories/GHSA-1234-5678-90ab',
      )
    })

    it('should handle different GHSA IDs', () => {
      expect(getGhsaUrl('GHSA-xxxx-yyyy-zzzz')).toBe(
        'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
      )
    })
  })

  describe('fetchGhsaDetails', () => {
    it('should fetch and transform GHSA details', async () => {
      const apiResponse = {
        aliases: ['CVE-2023-1234'],
        cvss: {
          score: 7.5,
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
        },
        cwes: [
          { cweId: 'CWE-79', description: 'XSS', name: 'Cross-site Scripting' },
        ],
        details: 'Detailed description',
        ghsa_id: 'GHSA-1234-5678-90ab',
        published_at: '2023-01-01T00:00:00Z',
        references: [{ url: 'https://example.com' }],
        severity: 'high',
        summary: 'Security advisory summary',
        updated_at: '2023-01-02T00:00:00Z',
        vulnerabilities: [
          {
            firstPatchedVersion: { identifier: '1.2.3' },
            package: { ecosystem: 'npm', name: 'test-package' },
            vulnerableVersionRange: '< 1.2.3',
          },
        ],
        withdrawn_at: null,
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(apiResponse)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const details = await fetchGhsaDetails('GHSA-1234-5678-90ab')

      expect(details).toEqual({
        aliases: ['CVE-2023-1234'],
        cvss: {
          score: 7.5,
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
        },
        cwes: [
          { cweId: 'CWE-79', description: 'XSS', name: 'Cross-site Scripting' },
        ],
        details: 'Detailed description',
        ghsaId: 'GHSA-1234-5678-90ab',
        publishedAt: '2023-01-01T00:00:00Z',
        references: [{ url: 'https://example.com' }],
        severity: 'high',
        summary: 'Security advisory summary',
        updatedAt: '2023-01-02T00:00:00Z',
        vulnerabilities: [
          {
            firstPatchedVersion: { identifier: '1.2.3' },
            package: { ecosystem: 'npm', name: 'test-package' },
            vulnerableVersionRange: '< 1.2.3',
          },
        ],
        withdrawnAt: null,
      })

      expect(mockHttpRequest).toHaveBeenCalledWith(
        'https://api.github.com/advisories/GHSA-1234-5678-90ab',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
          }),
        }),
      )
    })

    it('should handle missing optional fields', async () => {
      const apiResponse = {
        cvss: null,
        details: 'Detailed description',
        ghsa_id: 'GHSA-1234-5678-90ab',
        published_at: '2023-01-01T00:00:00Z',
        severity: 'low',
        summary: 'Security advisory summary',
        updated_at: '2023-01-02T00:00:00Z',
        withdrawn_at: '2023-01-03T00:00:00Z',
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(apiResponse)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const details = await fetchGhsaDetails('GHSA-1234-5678-90ab')

      expect(details).toEqual({
        aliases: [],
        cvss: null,
        cwes: [],
        details: 'Detailed description',
        ghsaId: 'GHSA-1234-5678-90ab',
        publishedAt: '2023-01-01T00:00:00Z',
        references: [],
        severity: 'low',
        summary: 'Security advisory summary',
        updatedAt: '2023-01-02T00:00:00Z',
        vulnerabilities: [],
        withdrawnAt: '2023-01-03T00:00:00Z',
      })
    })

    it('should pass token to fetchGitHub', async () => {
      const apiResponse = {
        details: 'Test',
        ghsa_id: 'GHSA-test',
        published_at: '2023-01-01T00:00:00Z',
        severity: 'low',
        summary: 'Test',
        updated_at: '2023-01-02T00:00:00Z',
        withdrawn_at: null,
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(apiResponse)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      await fetchGhsaDetails('GHSA-test', { token: 'custom-token' })

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-token',
          }),
        }),
      )
    })
  })

  describe('cacheFetchGhsa', () => {
    beforeEach(async () => {
      await clearRefCache()
    })

    it('should fetch and cache GHSA details', async () => {
      const ghsaDetails: GhsaDetails = {
        aliases: [],
        cvss: null,
        cwes: [],
        details: 'Test details',
        ghsaId: 'GHSA-cache-test',
        publishedAt: '2023-01-01T00:00:00Z',
        references: [],
        severity: 'low',
        summary: 'Test summary',
        updatedAt: '2023-01-02T00:00:00Z',
        vulnerabilities: [],
        withdrawnAt: null,
      }

      const apiResponse = {
        details: 'Test details',
        ghsa_id: 'GHSA-cache-test',
        published_at: '2023-01-01T00:00:00Z',
        severity: 'low',
        summary: 'Test summary',
        updated_at: '2023-01-02T00:00:00Z',
        withdrawn_at: null,
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(apiResponse)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      const result1 = await cacheFetchGhsa('GHSA-cache-test')
      expect(result1).toEqual(ghsaDetails)
      expect(mockHttpRequest).toHaveBeenCalledTimes(1)

      // Second call should use cache
      const result2 = await cacheFetchGhsa('GHSA-cache-test')
      expect(result2).toEqual(ghsaDetails)
      // Should still be 1 call due to caching
      expect(mockHttpRequest).toHaveBeenCalledTimes(1)
    })

    it('should bypass cache when DISABLE_GITHUB_CACHE is set', async () => {
      process.env['DISABLE_GITHUB_CACHE'] = '1'

      const apiResponse = {
        details: 'Test details',
        ghsa_id: 'GHSA-no-cache',
        published_at: '2023-01-01T00:00:00Z',
        severity: 'low',
        summary: 'Test summary',
        updated_at: '2023-01-02T00:00:00Z',
        withdrawn_at: null,
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(apiResponse)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      await cacheFetchGhsa('GHSA-no-cache')
      await cacheFetchGhsa('GHSA-no-cache')

      // Should make two calls when cache is disabled
      expect(mockHttpRequest).toHaveBeenCalledTimes(2)
    })

    it('should pass token to fetchGhsaDetails', async () => {
      const apiResponse = {
        details: 'Test',
        ghsa_id: 'GHSA-token',
        published_at: '2023-01-01T00:00:00Z',
        severity: 'low',
        summary: 'Test',
        updated_at: '2023-01-02T00:00:00Z',
        withdrawn_at: null,
      }

      mockHttpRequest.mockResolvedValue({
        body: Buffer.from(JSON.stringify(apiResponse)),
        headers: {},
        ok: true,
        status: 200,
        statusText: 'OK',
      })

      await cacheFetchGhsa('GHSA-token', { token: 'custom-token' })

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer custom-token',
          }),
        }),
      )
    })
  })
})
