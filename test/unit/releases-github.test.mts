/**
 * @fileoverview Unit tests for GitHub release download utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import picomatch from 'picomatch'

import {
  findReleaseAsset,
  getAuthHeaders,
  SOCKET_BTM_REPO,
} from '@socketsecurity/lib/releases/github'

import type { HttpResponse } from '@socketsecurity/lib/http-request'
import { httpRequest } from '@socketsecurity/lib/http-request'

// Mock httpRequest module.
vi.mock('@socketsecurity/lib/http-request')

/**
 * Create a mock HttpResponse object for testing.
 *
 * @param body - Response body as Buffer
 * @param ok - Whether the request was successful
 * @param status - HTTP status code
 * @returns Complete mock HttpResponse object
 */
function createMockHttpResponse(
  body: Buffer,
  ok: boolean,
  status: number,
): HttpResponse {
  return {
    arrayBuffer: () => {
      const slice = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      )
      return slice as ArrayBuffer
    },
    body,
    headers: {},
    json<T = unknown>(): T {
      return JSON.parse(body.toString('utf8')) as T
    },
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: () => body.toString('utf8'),
  }
}

describe('releases/github', () => {
  describe('SOCKET_BTM_REPO', () => {
    it('should export socket-btm repository config', () => {
      expect(SOCKET_BTM_REPO).toEqual({
        owner: 'SocketDev',
        repo: 'socket-btm',
      })
    })
  })

  describe('getAuthHeaders', () => {
    it('should return headers with Accept and API version', () => {
      const headers = getAuthHeaders()
      expect(headers['Accept']).toBe('application/vnd.github+json')
      expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    })

    it('should include Authorization header when GH_TOKEN is set', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        delete process.env['GITHUB_TOKEN']
        process.env['GH_TOKEN'] = 'test-token-123'

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBe('Bearer test-token-123')
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        } else {
          delete process.env['GH_TOKEN']
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        }
      }
    })

    it('should include Authorization header when GITHUB_TOKEN is set', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        delete process.env['GH_TOKEN']
        process.env['GITHUB_TOKEN'] = 'github-token-456'

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBe('Bearer github-token-456')
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        } else {
          delete process.env['GITHUB_TOKEN']
        }
      }
    })

    it('should prefer GH_TOKEN over GITHUB_TOKEN', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        process.env['GH_TOKEN'] = 'gh-token'
        process.env['GITHUB_TOKEN'] = 'github-token'

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBe('Bearer gh-token')
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        } else {
          delete process.env['GH_TOKEN']
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        } else {
          delete process.env['GITHUB_TOKEN']
        }
      }
    })

    it('should not include Authorization header when no token is set', () => {
      const originalGhToken = process.env['GH_TOKEN']
      const originalGithubToken = process.env['GITHUB_TOKEN']

      try {
        delete process.env['GH_TOKEN']
        delete process.env['GITHUB_TOKEN']

        const headers = getAuthHeaders()
        expect(headers['Authorization']).toBeUndefined()
      } finally {
        if (originalGhToken !== undefined) {
          process.env['GH_TOKEN'] = originalGhToken
        }
        if (originalGithubToken !== undefined) {
          process.env['GITHUB_TOKEN'] = originalGithubToken
        }
      }
    })
  })

  describe('picomatch integration', () => {
    it('should match simple wildcard patterns', () => {
      const isMatch = picomatch('yoga-sync-*.mjs')
      expect(isMatch('yoga-sync-abc123.mjs')).toBe(true)
      expect(isMatch('yoga-sync-2024-01-15.mjs')).toBe(true)
      expect(isMatch('models-xyz.tar.gz')).toBe(false)
      expect(isMatch('yoga-sync.js')).toBe(false)
    })

    it('should match patterns with multiple wildcards', () => {
      const isMatch = picomatch('models-*-*.tar.gz')
      expect(isMatch('models-2024-01-15.tar.gz')).toBe(true)
      expect(isMatch('models-foo-bar.tar.gz')).toBe(true)
      expect(isMatch('models-xyz.tar.gz')).toBe(false)
    })

    it('should match patterns with braces', () => {
      const isMatch = picomatch('yoga-{sync,layout}-*.{mjs,js}')
      expect(isMatch('yoga-sync-abc.mjs')).toBe(true)
      expect(isMatch('yoga-layout-xyz.js')).toBe(true)
      expect(isMatch('yoga-sync-abc.ts')).toBe(false)
      expect(isMatch('yoga-other-xyz.mjs')).toBe(false)
    })

    it('should match exact patterns without wildcards', () => {
      const isMatch = picomatch('exact-name.txt')
      expect(isMatch('exact-name.txt')).toBe(true)
      expect(isMatch('exact-name.md')).toBe(false)
      expect(isMatch('other-name.txt')).toBe(false)
    })

    it('should match patterns starting with wildcard', () => {
      const isMatch = picomatch('*-models.tar.gz')
      expect(isMatch('foo-models.tar.gz')).toBe(true)
      expect(isMatch('bar-models.tar.gz')).toBe(true)
      expect(isMatch('models.tar.gz')).toBe(false)
    })

    it('should match patterns ending with wildcard', () => {
      const isMatch = picomatch('yoga-*')
      expect(isMatch('yoga-sync')).toBe(true)
      expect(isMatch('yoga-layout')).toBe(true)
      expect(isMatch('yoga-')).toBe(true)
      expect(isMatch('models-sync')).toBe(false)
    })

    it('should support double-star globstar patterns', () => {
      const isMatch = picomatch('**/*.mjs')
      expect(isMatch('yoga-sync.mjs')).toBe(true)
      expect(isMatch('dir/yoga-sync.mjs')).toBe(true)
      expect(isMatch('deep/nested/dir/file.mjs')).toBe(true)
      expect(isMatch('file.js')).toBe(false)
    })

    it('should be case-sensitive by default', () => {
      const isMatch = picomatch('yoga-sync-*.mjs')
      expect(isMatch('yoga-sync-ABC.mjs')).toBe(true)
      expect(isMatch('Yoga-Sync-abc.mjs')).toBe(false)
      expect(isMatch('YOGA-SYNC-abc.MJS')).toBe(false)
    })
  })

  describe('findReleaseAsset', () => {
    // Mock release data with realistic socket-btm asset names.
    const mockReleases = [
      {
        assets: [
          { name: 'yoga-sync-20260107-abc123.mjs' },
          { name: 'yoga-layout-20260107-abc123.mjs' },
          { name: 'yoga-wasm-20260107-abc123.wasm' },
          { name: 'models-20260107-abc123.tar.gz' },
        ],
        tag_name: 'yoga-layout-20260107-abc123',
      },
      {
        assets: [
          { name: 'models-20260106-def456.tar.gz' },
          { name: 'models-embeddings-20260106-def456.bin' },
          { name: 'something-models.tar.gz' },
        ],
        tag_name: 'models-20260106-def456',
      },
      {
        assets: [
          { name: 'node-darwin-arm64' },
          { name: 'node-darwin-x64' },
          { name: 'node-linux-x64' },
          { name: 'node-linux-x64-musl' },
          { name: 'node-win-x64.exe' },
        ],
        tag_name: 'node-smol-20260105-ghi789',
      },
      {
        assets: [{ name: 'exact-match.txt' }, { name: 'other-file.md' }],
        tag_name: 'other-tool-20260104-jkl012',
      },
    ]

    beforeEach(() => {
      // Reset and configure the mock.
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(mockReleases)),
          true,
          200,
        ),
      )
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    describe('string glob patterns', () => {
      it('should match simple wildcard pattern', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-sync-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match pattern with multiple wildcards', async () => {
        const result = await findReleaseAsset(
          'models-',
          'models-*-*.tar.gz',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'models-20260106-def456.tar.gz',
          tag: 'models-20260106-def456',
        })
      })

      it('should match brace expansion pattern for multiple options', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-{sync,layout}-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        // Should match first asset that matches (yoga-sync comes first).
        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match brace expansion with file extensions', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-sync-*.{mjs,js}',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match complex brace pattern with multiple groups', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          '{yoga,models}-{sync,layout}-*.{mjs,wasm}',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match globstar pattern', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          '**/*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        // Should match first .mjs file found.
        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match prefix wildcard pattern', async () => {
        const result = await findReleaseAsset(
          'models-',
          '*-models.tar.gz',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'something-models.tar.gz',
          tag: 'models-20260106-def456',
        })
      })

      it('should match suffix wildcard pattern', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-*',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        // Should match first asset starting with yoga-.
        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match exact name without wildcards', async () => {
        const result = await findReleaseAsset(
          'other-tool-',
          'exact-match.txt',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'exact-match.txt',
          tag: 'other-tool-20260104-jkl012',
        })
      })

      it('should be case-sensitive', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'Yoga-Sync-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        // Should not match due to case difference.
        expect(result).toBeNull()
      })

      it('should return null when pattern does not match any assets', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'nonexistent-*.xyz',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toBeNull()
      })

      it('should return null when tool prefix does not match any releases', async () => {
        const result = await findReleaseAsset(
          'nonexistent-tool-',
          'yoga-sync-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toBeNull()
      })

      it('should match specific file extension patterns', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          '*.wasm',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'yoga-wasm-20260107-abc123.wasm',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match platform-specific binary patterns', async () => {
        const result = await findReleaseAsset(
          'node-smol-',
          'node-darwin-*',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'node-darwin-arm64',
          tag: 'node-smol-20260105-ghi789',
        })
      })

      it('should match Windows executable pattern', async () => {
        const result = await findReleaseAsset(
          'node-smol-',
          'node-win-*.exe',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'node-win-x64.exe',
          tag: 'node-smol-20260105-ghi789',
        })
      })

      it('should match musl-specific binary pattern', async () => {
        const result = await findReleaseAsset(
          'node-smol-',
          'node-*-musl',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'node-linux-x64-musl',
          tag: 'node-smol-20260105-ghi789',
        })
      })
    })

    describe('object patterns (backward compatibility)', () => {
      it('should match prefix and suffix pattern', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          { prefix: 'yoga-sync-', suffix: '.mjs' },
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match exact prefix and suffix', async () => {
        const result = await findReleaseAsset(
          'other-tool-',
          { prefix: 'exact-match', suffix: '.txt' },
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'exact-match.txt',
          tag: 'other-tool-20260104-jkl012',
        })
      })

      it('should return null when object pattern does not match', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          { prefix: 'nonexistent-', suffix: '.xyz' },
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toBeNull()
      })
    })

    describe('RegExp patterns', () => {
      it('should match RegExp pattern', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          /^yoga-sync-.+\.mjs$/,
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should match complex RegExp with date pattern', async () => {
        const result = await findReleaseAsset(
          'models-',
          /^models-\d{8}-.+\.tar\.gz$/,
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'models-20260106-def456.tar.gz',
          tag: 'models-20260106-def456',
        })
      })

      it('should return null when RegExp does not match', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          /^nonexistent-.+$/,
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toBeNull()
      })
    })

    describe('edge cases', () => {
      it('should handle empty assets array', async () => {
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(
            Buffer.from(
              JSON.stringify([
                {
                  assets: [],
                  tag_name: 'yoga-layout-20260107-abc123',
                },
              ]),
            ),
            true,
            200,
          ),
        )

        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-sync-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toBeNull()
      })

      it('should handle empty releases array', async () => {
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(Buffer.from(JSON.stringify([])), true, 200),
        )

        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-sync-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toBeNull()
      })

      it('should use first matching release when multiple releases match', async () => {
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(
            Buffer.from(
              JSON.stringify([
                {
                  assets: [{ name: 'yoga-sync-newer.mjs' }],
                  tag_name: 'yoga-layout-20260108-xyz',
                },
                {
                  assets: [{ name: 'yoga-sync-older.mjs' }],
                  tag_name: 'yoga-layout-20260107-abc',
                },
              ]),
            ),
            true,
            200,
          ),
        )

        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-sync-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        // Should return first matching release.
        expect(result).toEqual({
          assetName: 'yoga-sync-newer.mjs',
          tag: 'yoga-layout-20260108-xyz',
        })
      })

      it('should use first matching asset when multiple assets match', async () => {
        const result = await findReleaseAsset(
          'yoga-layout-',
          'yoga-*.mjs',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        // Should return first matching asset (yoga-sync comes before yoga-layout in array).
        expect(result).toEqual({
          assetName: 'yoga-sync-20260107-abc123.mjs',
          tag: 'yoga-layout-20260107-abc123',
        })
      })

      it('should handle pattern with special regex characters', async () => {
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(
            Buffer.from(
              JSON.stringify([
                {
                  assets: [
                    { name: 'file.test.js' },
                    { name: 'file-test-js' },
                    { name: 'fileXtestXjs' },
                  ],
                  tag_name: 'test-tool-20260107',
                },
              ]),
            ),
            true,
            200,
          ),
        )

        // Glob pattern treats . as literal dot, not regex wildcard.
        const result = await findReleaseAsset(
          'test-tool-',
          'file.test.js',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'file.test.js',
          tag: 'test-tool-20260107',
        })
      })

      it('should handle assets with similar prefixes', async () => {
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(
            Buffer.from(
              JSON.stringify([
                {
                  assets: [
                    { name: 'models.tar.gz' },
                    { name: 'models-extra.tar.gz' },
                    { name: 'models-data.tar.gz' },
                  ],
                  tag_name: 'models-20260107',
                },
              ]),
            ),
            true,
            200,
          ),
        )

        const result = await findReleaseAsset(
          'models-',
          'models-*.tar.gz',
          SOCKET_BTM_REPO,
          { quiet: true },
        )

        expect(result).toEqual({
          assetName: 'models-extra.tar.gz',
          tag: 'models-20260107',
        })
      })
    })

    describe('error handling', () => {
      it('should handle HTTP request failure', async () => {
        // Mock to consistently return error response for all retries.
        // The pRetry will retry with exponential backoff (5s, 10s, 20s) before finally failing.
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(Buffer.from('Not found'), false, 404),
        )

        await expect(
          findReleaseAsset('yoga-layout-', 'yoga-sync-*.mjs', SOCKET_BTM_REPO, {
            quiet: true,
          }),
        ).rejects.toThrow('Failed to fetch releases: 404')
      }, 40_000)

      it('should handle malformed JSON response', async () => {
        // Mock to consistently return malformed JSON for all retries.
        // The pRetry will retry with exponential backoff before finally failing.
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(Buffer.from('invalid json'), true, 200),
        )

        await expect(
          findReleaseAsset('yoga-layout-', 'yoga-sync-*.mjs', SOCKET_BTM_REPO, {
            quiet: true,
          }),
        ).rejects.toThrow()
      }, 40_000)
    })
  })
})
