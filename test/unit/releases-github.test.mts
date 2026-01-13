/**
 * @fileoverview Unit tests for GitHub release download utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import picomatch from 'picomatch'

import {
  downloadReleaseAsset,
  getAuthHeaders,
  getLatestRelease,
  getReleaseAssetUrl,
  SOCKET_BTM_REPO,
} from '@socketsecurity/lib/releases/github'

import type { HttpResponse } from '@socketsecurity/lib/http-request'
import { httpDownload, httpRequest } from '@socketsecurity/lib/http-request'

// Mock httpRequest and httpDownload modules.
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

  describe('getLatestRelease', () => {
    const mockReleases = [
      {
        assets: [
          { name: 'yoga-sync-20260107-abc123.mjs' },
          { name: 'yoga-layout-20260107-abc123.mjs' },
        ],
        tag_name: 'yoga-layout-20260107-abc123',
      },
      {
        assets: [
          { name: 'models-20260106-def456.tar.gz' },
          { name: 'models-embeddings-20260106-def456.bin' },
        ],
        tag_name: 'models-20260106-def456',
      },
      {
        assets: [{ name: 'node-darwin-arm64' }, { name: 'node-linux-x64' }],
        tag_name: 'node-smol-20260105-ghi789',
      },
    ]

    beforeEach(() => {
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

    it('should find latest release by prefix without asset pattern', async () => {
      const tag = await getLatestRelease('yoga-layout-', SOCKET_BTM_REPO, {
        quiet: true,
      })
      expect(tag).toBe('yoga-layout-20260107-abc123')
    })

    it('should find latest release by prefix with matching asset pattern', async () => {
      const tag = await getLatestRelease('yoga-layout-', SOCKET_BTM_REPO, {
        assetPattern: 'yoga-sync-*.mjs',
        quiet: true,
      })
      expect(tag).toBe('yoga-layout-20260107-abc123')
    })

    it('should skip release without matching asset when pattern provided', async () => {
      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO, {
        assetPattern: '*.tar.gz',
        quiet: true,
      })
      expect(tag).toBeNull()
    })

    it('should match asset with brace expansion pattern', async () => {
      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        assetPattern: 'models-{embeddings,data}-*.{bin,dat}',
        quiet: true,
      })
      expect(tag).toBe('models-20260106-def456')
    })

    it('should match asset with RegExp pattern', async () => {
      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        assetPattern: /^models-\d{8}-.+\.tar\.gz$/,
        quiet: true,
      })
      expect(tag).toBe('models-20260106-def456')
    })

    it('should return null when no releases match prefix', async () => {
      const tag = await getLatestRelease('nonexistent-', SOCKET_BTM_REPO, {
        quiet: true,
      })
      expect(tag).toBeNull()
    })

    it('should sort by published_at and return most recent release', async () => {
      // Mock releases with same prefix but different published_at times.
      const releasesOutOfOrder = [
        {
          assets: [{ name: 'node-darwin-arm64' }],
          published_at: '2026-01-12T10:00:00Z',
          tag_name: 'node-smol-20260112-d8601d1',
        },
        {
          assets: [{ name: 'node-darwin-arm64' }],
          published_at: '2026-01-12T15:30:00Z', // Most recent
          tag_name: 'node-smol-20260112-9ec3865',
        },
        {
          assets: [{ name: 'node-darwin-arm64' }],
          published_at: '2026-01-12T08:00:00Z',
          tag_name: 'node-smol-20260112-abc1234',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(releasesOutOfOrder)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO, {
        quiet: true,
      })

      // Should return the release with the latest published_at time.
      expect(tag).toBe('node-smol-20260112-9ec3865')
    })

    it('should handle multiple releases on same day with different times', async () => {
      // Simulate scenario where GitHub API returns releases in arbitrary order.
      const sameDay = [
        {
          assets: [{ name: 'yoga-sync-abc.mjs' }],
          published_at: '2026-01-12T09:15:22Z',
          tag_name: 'yoga-layout-20260112-first',
        },
        {
          assets: [{ name: 'yoga-sync-xyz.mjs' }],
          published_at: '2026-01-12T14:45:10Z', // Latest
          tag_name: 'yoga-layout-20260112-latest',
        },
        {
          assets: [{ name: 'yoga-sync-def.mjs' }],
          published_at: '2026-01-12T11:30:00Z',
          tag_name: 'yoga-layout-20260112-middle',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(Buffer.from(JSON.stringify(sameDay)), true, 200),
      )

      const tag = await getLatestRelease('yoga-layout-', SOCKET_BTM_REPO, {
        quiet: true,
      })

      expect(tag).toBe('yoga-layout-20260112-latest')
    })

    it('should sort by published_at even when API returns newest first', async () => {
      // Test that we don't rely on API ordering.
      const releasesNewestFirst = [
        {
          assets: [{ name: 'models-data.tar.gz' }],
          published_at: '2026-01-15T12:00:00Z', // Newest
          tag_name: 'models-20260115-newest',
        },
        {
          assets: [{ name: 'models-data.tar.gz' }],
          published_at: '2026-01-14T12:00:00Z',
          tag_name: 'models-20260114-older',
        },
        {
          assets: [{ name: 'models-data.tar.gz' }],
          published_at: '2026-01-13T12:00:00Z',
          tag_name: 'models-20260113-oldest',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(releasesNewestFirst)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        quiet: true,
      })

      expect(tag).toBe('models-20260115-newest')
    })

    it('should sort by published_at with asset pattern filtering', async () => {
      // Multiple releases matching prefix, but only some have matching assets.
      const releasesWithAssets = [
        {
          assets: [{ name: 'node-linux-x64' }], // No matching asset
          published_at: '2026-01-12T16:00:00Z',
          tag_name: 'node-smol-20260112-no-match',
        },
        {
          assets: [{ name: 'node-darwin-arm64' }], // Matching asset, oldest
          published_at: '2026-01-12T10:00:00Z',
          tag_name: 'node-smol-20260112-older',
        },
        {
          assets: [{ name: 'node-darwin-arm64' }], // Matching asset, newest
          published_at: '2026-01-12T14:00:00Z',
          tag_name: 'node-smol-20260112-newer',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(releasesWithAssets)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO, {
        assetPattern: 'node-darwin-*',
        quiet: true,
      })

      // Should return the newest release that has the matching asset.
      expect(tag).toBe('node-smol-20260112-newer')
    })

    it('should skip releases with no assets', async () => {
      // Mock releases where the newest has no assets (empty placeholder release).
      const releasesWithEmpty = [
        {
          assets: [], // Empty release (no binaries built yet)
          published_at: '2026-01-13T03:06:00Z', // Newest but empty
          tag_name: 'node-smol-20260113-121d029',
        },
        {
          assets: [{ name: 'node-darwin-arm64' }, { name: 'node-linux-x64' }],
          published_at: '2025-12-26T00:17:00Z', // Older but has assets
          tag_name: 'node-smol-20251226-2126245',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(releasesWithEmpty)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO, {
        quiet: true,
      })

      // Should skip the empty release and return the older release with assets.
      expect(tag).toBe('node-smol-20251226-2126245')
    })

    it('should return null when all matching releases have no assets', async () => {
      // All releases matching prefix are empty.
      const allEmpty = [
        {
          assets: [],
          published_at: '2026-01-13T03:06:00Z',
          tag_name: 'binject-20260113-121d029',
        },
        {
          assets: [],
          published_at: '2026-01-13T03:05:00Z',
          tag_name: 'binject-20260113-abc1234',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(allEmpty)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('binject-', SOCKET_BTM_REPO, {
        quiet: true,
      })

      // Should return null since all matching releases are empty.
      expect(tag).toBeNull()
    })

    it('should skip empty releases when asset pattern is provided', async () => {
      // Mix of empty releases and releases with assets.
      const mixedReleases = [
        {
          assets: [], // Empty
          published_at: '2026-01-13T03:00:00Z',
          tag_name: 'models-20260113-empty',
        },
        {
          assets: [{ name: 'models-embeddings.bin' }], // Wrong asset
          published_at: '2026-01-12T12:00:00Z',
          tag_name: 'models-20260112-wrong',
        },
        {
          assets: [{ name: 'models-data.tar.gz' }], // Correct asset
          published_at: '2026-01-11T12:00:00Z',
          tag_name: 'models-20260111-correct',
        },
      ]

      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(mixedReleases)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        assetPattern: '*.tar.gz',
        quiet: true,
      })

      // Should skip empty release and release without matching asset.
      expect(tag).toBe('models-20260111-correct')
    })
  })

  describe('getReleaseAssetUrl', () => {
    const mockRelease = {
      assets: [
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
          name: 'yoga-sync-20260107-abc123.mjs',
        },
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/yoga-layout-20260107-abc123.mjs',
          name: 'yoga-layout-20260107-abc123.mjs',
        },
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
          name: 'models-data.tar.gz',
        },
      ],
      tag_name: 'v1.0.0',
    }

    beforeEach(() => {
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(mockRelease)),
          true,
          200,
        ),
      )
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    it('should get asset URL with exact name', async () => {
      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'yoga-sync-20260107-abc123.mjs',
        SOCKET_BTM_REPO,
        { quiet: true },
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
      )
    })

    it('should get asset URL with wildcard pattern', async () => {
      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'yoga-sync-*.mjs',
        SOCKET_BTM_REPO,
        { quiet: true },
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
      )
    })

    it('should get asset URL with brace expansion', async () => {
      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'yoga-{sync,layout}-*.mjs',
        SOCKET_BTM_REPO,
        { quiet: true },
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
      )
    })

    it('should get asset URL with RegExp pattern', async () => {
      const url = await getReleaseAssetUrl(
        'v1.0.0',
        /^models-.+\.tar\.gz$/,
        SOCKET_BTM_REPO,
        { quiet: true },
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
      )
    })

    it('should get asset URL with prefix/suffix object pattern', async () => {
      const url = await getReleaseAssetUrl(
        'v1.0.0',
        { prefix: 'models-', suffix: '.tar.gz' },
        SOCKET_BTM_REPO,
        { quiet: true },
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
      )
    })

    it('should throw error when pattern does not match any asset', async () => {
      await expect(
        getReleaseAssetUrl('v1.0.0', 'nonexistent-*.xyz', SOCKET_BTM_REPO, {
          quiet: true,
        }),
      ).rejects.toThrow('Asset nonexistent-*.xyz not found in release v1.0.0')
    }, 40_000)
  })

  describe('downloadReleaseAsset', () => {
    const mockRelease = {
      assets: [
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
          name: 'yoga-sync-abc.mjs',
        },
        {
          browser_download_url:
            'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
          name: 'models-data.tar.gz',
        },
      ],
      tag_name: 'v1.0.0',
    }

    beforeEach(() => {
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSON.stringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValue(undefined)
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    it('should download asset with exact name', async () => {
      await downloadReleaseAsset(
        'v1.0.0',
        'yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        SOCKET_BTM_REPO,
        { quiet: true },
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        expect.objectContaining({
          progressInterval: 10,
          retries: 2,
          retryDelay: 5000,
        }),
      )
    })

    it('should download asset with wildcard pattern', async () => {
      await downloadReleaseAsset(
        'v1.0.0',
        'yoga-*.mjs',
        '/tmp/output.mjs',
        SOCKET_BTM_REPO,
        { quiet: true },
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        expect.any(Object),
      )
    })

    it('should download asset with brace expansion', async () => {
      await downloadReleaseAsset(
        'v1.0.0',
        '{yoga,models}-*.{mjs,tar.gz}',
        '/tmp/output',
        SOCKET_BTM_REPO,
        { quiet: true },
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output',
        expect.any(Object),
      )
    })

    it('should throw error when pattern does not match', async () => {
      await expect(
        downloadReleaseAsset(
          'v1.0.0',
          'nonexistent-*.xyz',
          '/tmp/output.xyz',
          SOCKET_BTM_REPO,
          { quiet: true },
        ),
      ).rejects.toThrow('Asset nonexistent-*.xyz not found in release v1.0.0')
    }, 40_000)
  })
})
