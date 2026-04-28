/**
 * @fileoverview Unit tests for GitHub release download utilities.
 */

import { existsSync } from 'node:fs'
import process from 'node:process'

import { safeDelete } from '@socketsecurity/lib/fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// @ts-expect-error - no type declarations
import picomatch from 'picomatch'

import {
  downloadReleaseAsset,
  getAuthHeaders,
  getLatestRelease,
  getReleaseAssetUrl,
} from '../../src/releases/github'
import { SOCKET_BTM_REPO } from '../../src/releases/socket-btm'

import type { HttpDownloadResult, HttpResponse } from '../../src/http-request'
import { httpDownload, httpRequest } from '../../src/http-request'

// Mock httpRequest and httpDownload modules.
// Uses src path so vi.mock() intercepts cross-module imports within src/ files.
// Package specifier mocking (@socketsecurity/lib/http-request) does not work
// because dist/ CJS bundles bypass vitest's module mock system.
vi.mock('../../src/http-request')

// Match the production source's primordials convention so a consumer
// who patched `JSON.stringify` after import wouldn't perturb fixtures.
const JSONStringify = JSON.stringify

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

  // describe.sequential: vitest's vitest.config.mts runs tests
  // concurrently in non-CI mode (`isolate: false`), and our new
  // fallback tests use `vi.mockImplementation` which persists
  // mock state. Without sequential ordering, one test's `mockImplementation`
  // can race with another test's `mockResolvedValueOnce`. Sequential
  // ordering inside this describe keeps the mocks per-test predictable.
  describe.sequential('getLatestRelease', () => {
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
          Buffer.from(JSONStringify(mockReleases)),
          true,
          200,
        ),
      )
    })

    afterEach(() => {
      // resetAllMocks clears mockImplementation as well as call
      // history; some new fallback tests below set
      // `mockImplementation` for pRetry-aware mocking and that
      // must not leak into later tests.
      vi.resetAllMocks()
    })

    it('should find latest release by prefix without asset pattern', async () => {
      const tag = await getLatestRelease('yoga-layout-', SOCKET_BTM_REPO)
      expect(tag).toBe('yoga-layout-20260107-abc123')
    })

    it('should find latest release by prefix with matching asset pattern', async () => {
      const tag = await getLatestRelease('yoga-layout-', SOCKET_BTM_REPO, {
        assetPattern: 'yoga-sync-*.mjs',
      })
      expect(tag).toBe('yoga-layout-20260107-abc123')
    })

    it('should skip release without matching asset when pattern provided', async () => {
      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO, {
        assetPattern: '*.tar.gz',
      })
      expect(tag).toBeUndefined()
    })

    it('should match asset with brace expansion pattern', async () => {
      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        assetPattern: 'models-{embeddings,data}-*.{bin,dat}',
      })
      expect(tag).toBe('models-20260106-def456')
    })

    it('should match asset with RegExp pattern', async () => {
      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        assetPattern: /^models-\d{8}-.+\.tar\.gz$/,
      })
      expect(tag).toBe('models-20260106-def456')
    })

    it('should return undefined when no releases match prefix', async () => {
      const tag = await getLatestRelease('nonexistent-', SOCKET_BTM_REPO)
      expect(tag).toBeUndefined()
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
          Buffer.from(JSONStringify(releasesOutOfOrder)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO)

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
        createMockHttpResponse(Buffer.from(JSONStringify(sameDay)), true, 200),
      )

      const tag = await getLatestRelease('yoga-layout-', SOCKET_BTM_REPO)

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
          Buffer.from(JSONStringify(releasesNewestFirst)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO)

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
          Buffer.from(JSONStringify(releasesWithAssets)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO, {
        assetPattern: 'node-darwin-*',
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
          Buffer.from(JSONStringify(releasesWithEmpty)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('node-smol-', SOCKET_BTM_REPO)

      // Should skip the empty release and return the older release with assets.
      expect(tag).toBe('node-smol-20251226-2126245')
    })

    it('should return undefined when all matching releases have no assets', async () => {
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
        createMockHttpResponse(Buffer.from(JSONStringify(allEmpty)), true, 200),
      )

      const tag = await getLatestRelease('binject-', SOCKET_BTM_REPO)

      // Should return null since all matching releases are empty.
      expect(tag).toBeUndefined()
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
          Buffer.from(JSONStringify(mixedReleases)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('models-', SOCKET_BTM_REPO, {
        assetPattern: '*.tar.gz',
      })

      // Should skip empty release and release without matching asset.
      expect(tag).toBe('models-20260111-correct')
    })

    it('should fall back to GraphQL when REST returns 200 + empty body', async () => {
      // GitHub Elasticsearch outage signature: REST returns HTTP 200
      // OK with a zero-byte body. There's no error code, no Retry-After,
      // and no rate-limit signal — just an empty payload. The helper
      // detects this as an empty REST result and re-queries via
      // GraphQL, which hits a different backend and stays consistent
      // through the outage.
      const graphqlPayload = {
        data: {
          repository: {
            releases: {
              nodes: [
                {
                  publishedAt: '2026-01-15T12:00:00Z',
                  releaseAssets: { nodes: [{ name: 'binject-darwin-arm64' }] },
                  tagName: 'binject-20260115-abc1234',
                },
              ],
            },
          },
        },
      }
      vi.mocked(httpRequest)
        // 1st call: REST → 200 + empty body (incident shape)
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from(''), true, 200),
        )
        // 2nd call: GraphQL → real result
        .mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(JSONStringify(graphqlPayload)),
            true,
            200,
          ),
        )

      const tag = await getLatestRelease('binject-', SOCKET_BTM_REPO)

      expect(tag).toBe('binject-20260115-abc1234')
    })

    it('should fall back to GraphQL when REST returns 200 + literal []', async () => {
      // The other observed incident shape: REST returns 200 with the
      // literal empty array `[]` (parsed cleanly as `Array.isArray`).
      // Same fallback path — the helper can't distinguish a degraded
      // listing from a brand-new empty repo without cross-checking.
      const graphqlPayload = {
        data: {
          repository: {
            releases: {
              nodes: [
                {
                  publishedAt: '2026-01-15T12:00:00Z',
                  releaseAssets: {
                    nodes: [{ name: 'curl-linux-x64' }],
                  },
                  tagName: 'curl-20260115-abc1234',
                },
              ],
            },
          },
        },
      }
      vi.mocked(httpRequest)
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from('[]'), true, 200),
        )
        .mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(JSONStringify(graphqlPayload)),
            true,
            200,
          ),
        )

      const tag = await getLatestRelease('curl-', SOCKET_BTM_REPO)

      expect(tag).toBe('curl-20260115-abc1234')
    })

    it('should return undefined when both REST and GraphQL return empty', async () => {
      // Repo that genuinely has no releases — both backends agree.
      // This is the only path where a `null` return is correct; we
      // must not let an outage signal masquerade as "no releases".
      const emptyGraphqlPayload = {
        data: { repository: { releases: { nodes: [] } } },
      }
      vi.mocked(httpRequest)
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from('[]'), true, 200),
        )
        .mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(JSONStringify(emptyGraphqlPayload)),
            true,
            200,
          ),
        )

      const tag = await getLatestRelease('nonexistent-', SOCKET_BTM_REPO)

      expect(tag).toBeUndefined()
    })

    it('should propagate errors[] from GraphQL fallback', async () => {
      // REST is degraded → GraphQL fallback fires, but GraphQL
      // returns an `errors[]` payload (e.g. missing auth scope).
      // The helper should surface the GraphQL error so the user
      // can see exactly what upstream complained about, instead
      // of silently treating the empty response as "no releases".
      //
      // Uses `mockImplementation` (not `mockResolvedValueOnce`) so
      // pRetry's repeated attempts all receive the same answers
      // and we don't have to mock each retry round individually.
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        // Odd calls = REST (empty body), even = GraphQL errors[].
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(
          Buffer.from(
            JSONStringify({ errors: [{ message: 'Bad credentials' }] }),
          ),
          true,
          200,
        )
      })

      await expect(
        getLatestRelease('whatever-', SOCKET_BTM_REPO),
        // GraphQL errors[] now wraps in the "both transports failed"
        // surface error. The original GraphQL message lives in .cause.
      ).rejects.toThrow(
        /Failed to list SocketDev\/socket-btm releases: both REST and GraphQL backends degraded/,
      )
    }, 60_000)

    it('should NOT call GraphQL when REST returns a populated array', async () => {
      // Healthy GitHub: REST returns a populated list. The fallback
      // should NOT fire (no second http call). Verified by setting
      // a single `mockResolvedValueOnce` — if the helper made a
      // second call, the second mock would be undefined and the
      // test would throw a TypeError instead of resolving cleanly.
      const healthyRelease = [
        {
          assets: [{ name: 'curl-darwin-arm64' }],
          published_at: '2026-04-01T00:00:00Z',
          tag_name: 'curl-20260401-stable',
        },
      ]
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(healthyRelease)),
          true,
          200,
        ),
      )

      const tag = await getLatestRelease('curl-', SOCKET_BTM_REPO)
      expect(tag).toBe('curl-20260401-stable')
      // httpRequest invoked exactly once — REST only, no GraphQL.
      expect(vi.mocked(httpRequest)).toHaveBeenCalledTimes(1)
    })

    it('should throw on REST non-OK status (5xx)', async () => {
      // pRetry retries non-OK responses; eventually it gives up and
      // throws. We test that the helper correctly surfaces the
      // failure rather than silently returning null.
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from('Internal Server Error'),
          false,
          503,
        ),
      )

      await expect(getLatestRelease('curl-', SOCKET_BTM_REPO)).rejects.toThrow(
        /Failed to fetch SocketDev\/socket-btm releases: 503/,
      )
    }, 60_000)

    it('should throw on REST malformed JSON body', async () => {
      // 200 OK but the body isn't valid JSON. The helper wraps the
      // SyntaxError in a clear "Failed to parse" surface error.
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(Buffer.from('<html>not json</html>'), true, 200),
      )

      await expect(getLatestRelease('curl-', SOCKET_BTM_REPO)).rejects.toThrow(
        /Failed to parse SocketDev\/socket-btm releases response/,
      )
    }, 60_000)

    it('should throw informative error when both REST and GraphQL transport fail', async () => {
      // REST returns 200 + empty (incident shape) → fall back to GraphQL.
      // GraphQL itself returns non-OK. The wrapper surfaces a terse
      // "both REST and GraphQL backends degraded" library-API error
      // so the operator immediately knows to check GitHub status,
      // not their config.
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        // Odd calls = REST empty body; even = GraphQL 503.
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(
          Buffer.from('graphql unavailable'),
          false,
          503,
        )
      })

      await expect(getLatestRelease('curl-', SOCKET_BTM_REPO)).rejects.toThrow(
        /both REST and GraphQL backends degraded/,
      )
    }, 60_000)

    it('should throw on GraphQL fallback malformed JSON', async () => {
      // REST empty (incident) → GraphQL returns 200 with unparseable
      // body. Inside fetchReleasesViaGraphQL this throws a parse
      // error, which getLatestRelease wraps in "both backends
      // degraded". This exercises the GraphQL JSON.parse catch in
      // fetchReleasesViaGraphQL (line ~696).
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(
          Buffer.from('not valid json {'),
          true,
          200,
        )
      })

      await expect(getLatestRelease('curl-', SOCKET_BTM_REPO)).rejects.toThrow(
        /both REST and GraphQL backends degraded/,
      )
    }, 60_000)
  })

  // describe.sequential: same reasoning as getLatestRelease above
  // — pRetry-aware mocks (mockImplementation) need sequential ordering
  // so they don't leak across concurrent tests.
  describe.sequential('getReleaseAssetUrl', () => {
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

    afterEach(() => {
      // resetAllMocks clears both call history AND any
      // mockImplementation set by tests above. Some of the new
      // fallback tests use `mockImplementation` to handle pRetry's
      // repeated attempts cheaply, and that implementation must
      // not leak into later tests in this describe block.
      vi.resetAllMocks()
    })

    it('should get asset URL with exact name', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'yoga-sync-20260107-abc123.mjs',
        SOCKET_BTM_REPO,
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
      )
    })

    it('should get asset URL with wildcard pattern', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'yoga-sync-*.mjs',
        SOCKET_BTM_REPO,
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
      )
    })

    it('should get asset URL with brace expansion', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'yoga-{sync,layout}-*.mjs',
        SOCKET_BTM_REPO,
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-20260107-abc123.mjs',
      )
    })

    it('should get asset URL with RegExp pattern', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        /^models-.+\.tar\.gz$/,
        SOCKET_BTM_REPO,
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
      )
    })

    it('should get asset URL with prefix/suffix object pattern', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        { prefix: 'models-', suffix: '.tar.gz' },
        SOCKET_BTM_REPO,
      )
      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/models-data.tar.gz',
      )
    })

    it('should throw error when pattern does not match any asset', async () => {
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      await expect(
        getReleaseAssetUrl('v1.0.0', 'nonexistent-*.xyz', SOCKET_BTM_REPO),
      ).rejects.toThrow('Asset nonexistent-*.xyz not found in release v1.0.0')
    }, 40_000)

    it('should fall back to GraphQL when REST returns 200 + empty body', async () => {
      // Per-tag REST endpoint returns successfully but with no body —
      // the GitHub-incident shape. The fallback hits GraphQL
      // `repository.release(tagName).releaseAssets` and normalizes
      // GraphQL's `downloadUrl` field back to REST's
      // `browser_download_url` so the asset matcher works unchanged.
      const graphqlPayload = {
        data: {
          repository: {
            release: {
              releaseAssets: {
                nodes: [
                  {
                    downloadUrl:
                      'https://github.com/test/repo/releases/download/v1.0.0/curl-linux-x64',
                    name: 'curl-linux-x64',
                  },
                ],
                tagName: 'v1.0.0',
              },
            },
          },
        },
      }
      vi.mocked(httpRequest)
        // 1st: REST per-tag → 200 + empty body
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from(''), true, 200),
        )
        // 2nd: GraphQL release(tagName) → real result
        .mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(JSONStringify(graphqlPayload)),
            true,
            200,
          ),
        )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'curl-linux-x64',
        SOCKET_BTM_REPO,
      )

      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/curl-linux-x64',
      )
    })

    it('should throw when GraphQL fallback returns null release', async () => {
      // REST hit the empty-body incident shape, so we tried GraphQL.
      // GraphQL ran fine but returned `repository.release: null` —
      // there is no release with that tag. Surface a clear error
      // (not a silent skip) so the caller knows the tag is the
      // problem, not the transport.
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(
          Buffer.from(
            JSONStringify({ data: { repository: { release: null } } }),
          ),
          true,
          200,
        )
      })

      await expect(
        getReleaseAssetUrl(
          'tag-that-does-not-exist',
          'whatever-*.bin',
          SOCKET_BTM_REPO,
        ),
      ).rejects.toThrow(
        // The "GraphQL says null release" branch surfaces a clear
        // "Release X not found in owner/repo" message so the user
        // knows it's a missing-tag problem, not a transport problem.
        /Release tag-that-does-not-exist not found in SocketDev\/socket-btm/,
      )
    }, 60_000)

    it('should throw when GraphQL fallback returns errors[]', async () => {
      // GraphQL returned an `errors[]` payload (auth missing,
      // malformed query, etc.). The helper should throw with the
      // GraphQL error message included so the caller can see what
      // upstream actually said.
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(
          Buffer.from(
            JSONStringify({
              errors: [{ message: 'Field "release" requires authentication' }],
            }),
          ),
          true,
          200,
        )
      })

      await expect(
        getReleaseAssetUrl('v9.9.9', 'x-*.bin', SOCKET_BTM_REPO),
        // GraphQL errors[] wraps in the "both transports failed"
        // surface error per the new spec.
      ).rejects.toThrow(/both REST and GraphQL backends degraded/)
    }, 60_000)

    it('should retry via pRetry when both REST and GraphQL return empty', async () => {
      // Worst case: REST returns empty body, GraphQL ALSO returns
      // empty body. The helper inside the per-tag fallback throws
      // (since "both backends are degraded" is genuinely transient
      // and worth retrying with backoff). pRetry catches it. We
      // verify by mocking the FULL retry sequence: 3 rounds of
      // (REST empty + GraphQL empty) → final round succeeds.
      const successRelease = {
        assets: [
          {
            browser_download_url:
              'https://github.com/test/repo/releases/download/v1.0.0/recovered.bin',
            name: 'recovered.bin',
          },
        ],
      }
      vi.mocked(httpRequest)
        // attempt 1: REST empty + GraphQL empty
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from(''), true, 200),
        )
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from(''), true, 200),
        )
        // attempt 2: REST empty + GraphQL empty
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from(''), true, 200),
        )
        .mockResolvedValueOnce(
          createMockHttpResponse(Buffer.from(''), true, 200),
        )
        // attempt 3: REST recovers
        .mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(JSONStringify(successRelease)),
            true,
            200,
          ),
        )

      const url = await getReleaseAssetUrl(
        'v1.0.0',
        'recovered.bin',
        SOCKET_BTM_REPO,
      )

      expect(url).toBe(
        'https://github.com/test/repo/releases/download/v1.0.0/recovered.bin',
      )
    }, 120_000)

    it('should throw informative error when both REST and GraphQL transport fail', async () => {
      // REST returns 200 + empty body (incident), GraphQL transport
      // also fails (5xx). The wrapper surfaces "Both upstream
      // backends appear degraded" so the operator can correlate
      // with GitHub status.
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(
          Buffer.from('graphql unavailable'),
          false,
          503,
        )
      })

      await expect(
        getReleaseAssetUrl('v1.0.0', 'whatever-*.bin', SOCKET_BTM_REPO),
      ).rejects.toThrow(/both REST and GraphQL backends degraded/)
    }, 60_000)

    it('should throw on GraphQL fallback malformed JSON body', async () => {
      // REST empty (incident) → GraphQL responds 200 OK but with
      // unparseable body. Surfaces the parse-failure error.
      let call = 0
      vi.mocked(httpRequest).mockImplementation(async () => {
        call += 1
        if (call % 2 === 1) {
          return createMockHttpResponse(Buffer.from(''), true, 200)
        }
        return createMockHttpResponse(Buffer.from('not json at all'), true, 200)
      })

      await expect(
        getReleaseAssetUrl('v1.0.0', 'whatever-*.bin', SOCKET_BTM_REPO),
        // Parse error inside fetchReleaseAssetsViaGraphQL is treated
        // as a transport failure → wrapped in the "both transports
        // failed" surface error. The original SyntaxError is in
        // .cause for callers who want to drill down.
      ).rejects.toThrow(/both REST and GraphQL backends degraded/)
    }, 60_000)

    it('should throw on REST per-tag malformed JSON body', async () => {
      // REST returns 200 OK with non-empty but unparseable body.
      // The else-branch's JSON.parse throws → wrapped in
      // "Failed to parse GitHub release response for tag".
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(Buffer.from('<html>not json</html>'), true, 200),
      )

      await expect(
        getReleaseAssetUrl('v1.0.0', 'whatever-*.bin', SOCKET_BTM_REPO),
      ).rejects.toThrow(
        /Failed to parse SocketDev\/socket-btm release v1\.0\.0 response/,
      )
    }, 60_000)

    it('should throw on REST per-tag release missing assets', async () => {
      // REST returns 200 OK with valid JSON but no `assets` array.
      // ArrayIsArray check fails → "Release X has no assets".
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSONStringify({ tag_name: 'v1.0.0' })),
          true,
          200,
        ),
      )

      await expect(
        getReleaseAssetUrl('v1.0.0', 'whatever-*.bin', SOCKET_BTM_REPO),
      ).rejects.toThrow(
        /Release v1\.0\.0 has no assets in SocketDev\/socket-btm/,
      )
    }, 60_000)
  })

  // describe.sequential: prevents downloadReleaseAsset's
  // mockResolvedValue from racing with the prior describe block's
  // mockImplementation cleanup.
  describe.sequential('downloadReleaseAsset', () => {
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

    afterEach(() => {
      vi.clearAllMocks()
    })

    it('should download asset with exact name', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValueOnce(
        undefined as unknown as HttpDownloadResult,
      )

      await downloadReleaseAsset(
        'v1.0.0',
        'yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        SOCKET_BTM_REPO,
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
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValueOnce(
        undefined as unknown as HttpDownloadResult,
      )

      await downloadReleaseAsset(
        'v1.0.0',
        'yoga-*.mjs',
        '/tmp/output.mjs',
        SOCKET_BTM_REPO,
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output.mjs',
        expect.any(Object),
      )
    })

    it('should download asset with brace expansion', async () => {
      vi.mocked(httpRequest).mockResolvedValueOnce(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )
      vi.mocked(httpDownload).mockResolvedValueOnce(
        undefined as unknown as HttpDownloadResult,
      )

      await downloadReleaseAsset(
        'v1.0.0',
        '{yoga,models}-*.{mjs,tar.gz}',
        '/tmp/output',
        SOCKET_BTM_REPO,
      )

      expect(httpDownload).toHaveBeenCalledWith(
        'https://github.com/test/repo/releases/download/v1.0.0/yoga-sync-abc.mjs',
        '/tmp/output',
        expect.any(Object),
      )
    })

    it('should throw error when pattern does not match', async () => {
      // pRetry attempts the call up to 3 times — use
      // `mockResolvedValue` (always) instead of `mockResolvedValueOnce`
      // so each retry gets the same payload. Otherwise the second
      // pRetry attempt would receive `undefined` and throw an
      // unrelated "Cannot read properties of undefined" error.
      vi.mocked(httpRequest).mockResolvedValue(
        createMockHttpResponse(
          Buffer.from(JSONStringify(mockRelease)),
          true,
          200,
        ),
      )

      await expect(
        downloadReleaseAsset(
          'v1.0.0',
          'nonexistent-*.xyz',
          '/tmp/output.xyz',
          SOCKET_BTM_REPO,
        ),
      ).rejects.toThrow('Asset nonexistent-*.xyz not found in release v1.0.0')
    }, 40_000)
  })

  // .sequential is required because vitest's config sets
  // `concurrent: !process.env.CI` (.config/vitest.config.mts). These
  // tests share the module-level httpDownload / httpRequest mocks so
  // running them in parallel lets one test's call pollute another's
  // `toHaveBeenCalledTimes` assertion. Pattern borrowed from
  // test/unit/logger-advanced.test.mts which disables concurrency for
  // the same reason.
  describe.sequential('downloadGitHubRelease - TOCTOU race protection', () => {
    // Pre-populate the on-disk cache state synchronously before calling
    // downloadGitHubRelease, so the function under test can only
    // observe the state the test prepared. httpDownload is either
    // asserted-never-called (cache-hit path) or mocked as a trivial
    // no-op that writes the missing file for the re-download path.
    // No mock side effects interleave with the call under test.

    // All state (temp dir, imports) lives inside each `it` block so
    // nothing leaks across tests under `isolate: false`. The previous
    // rewrite used `let testDir` at the describe scope and flaked
    // because that single binding got overwritten by the next
    // test's beforeEach while vitest was still reporting the first
    // test's assertion. Using fully local state makes that impossible.
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('uses cache and does not call httpDownload when binary + version file exist and tag matches', async () => {
      const { downloadGitHubRelease } =
        await import('../../src/releases/github')
      const { promises: fs } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const nodePath = await import('node:path')

      const testDir = await fs.mkdtemp(
        nodePath.join(tmpdir(), 'test-github-dl-'),
      )
      try {
        // Pre-populate the cache exactly as a prior successful download
        // would have left it: binary + .version file with matching tag.
        // downloadGitHubRelease must short-circuit to the cached binary
        // path without touching httpDownload.
        const binaryFile = nodePath.join(testDir, 'test-bin')
        const versionFile = nodePath.join(testDir, '.version')
        await fs.writeFile(binaryFile, '#!/bin/bash\necho "test"', 'utf8')
        await fs.writeFile(versionFile, 'v1.0.0', 'utf8')

        const result = await downloadGitHubRelease({
          assetName: 'test-binary',
          binaryName: 'test-bin',
          downloadDir: testDir,
          owner: 'test-owner',
          platformArch: 'test-arch',
          repo: 'test-repo',
          tag: 'v1.0.0',
          toolName: 'test-tool',
        })

        expect(result).toBe(binaryFile)
        expect(httpDownload).not.toHaveBeenCalled()
        expect(httpRequest).not.toHaveBeenCalled()
        expect(existsSync(binaryFile)).toBe(true)
        expect(existsSync(versionFile)).toBe(true)
      } finally {
        await safeDelete(testDir, { force: true }).catch(() => {})
      }
    })

    it('re-downloads when version file exists but binary is missing (TOCTOU recovery)', async () => {
      const { downloadGitHubRelease } =
        await import('../../src/releases/github')
      const { promises: fs } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const nodePath = await import('node:path')

      const testDir = await fs.mkdtemp(
        nodePath.join(tmpdir(), 'test-github-dl-missing-'),
      )
      try {
        // The TOCTOU recovery path: version file claims the right tag
        // is cached, but the binary was removed (by OS cleanup, another
        // process, manual rm, etc.). The second existsSync check inside
        // downloadGitHubRelease must detect the missing binary after
        // reading the version file and fall through to re-download.
        const binaryFile = nodePath.join(testDir, 'test-bin')
        const versionFile = nodePath.join(testDir, '.version')
        await fs.writeFile(versionFile, 'v1.0.0', 'utf8')
        // Intentionally do NOT create binaryFile.

        vi.mocked(httpRequest).mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(
              JSONStringify({
                assets: [
                  {
                    browser_download_url: 'https://example.com/binary',
                    name: 'test-binary',
                  },
                ],
                tag_name: 'v1.0.0',
              }),
            ),
            true,
            200,
          ),
        )
        vi.mocked(httpDownload).mockImplementationOnce(
          async (_url, outputPath) => {
            await fs.writeFile(outputPath, '#!/bin/bash\necho "test"', 'utf8')
            return {
              headers: {},
              ok: true as const,
              path: outputPath,
              size: 22,
              status: 200,
              statusText: 'OK',
            }
          },
        )

        const result = await downloadGitHubRelease({
          assetName: 'test-binary',
          binaryName: 'test-bin',
          downloadDir: testDir,
          owner: 'test-owner',
          platformArch: 'test-arch',
          repo: 'test-repo',
          tag: 'v1.0.0',
          toolName: 'test-tool',
        })

        expect(result).toBe(binaryFile)
        expect(httpDownload).toHaveBeenCalledTimes(1)
        expect(existsSync(binaryFile)).toBe(true)
      } finally {
        await safeDelete(testDir, { force: true }).catch(() => {})
      }
    })

    it('re-downloads when version file tag does not match requested tag', async () => {
      const { downloadGitHubRelease } =
        await import('../../src/releases/github')
      const { promises: fs } = await import('node:fs')
      const { tmpdir } = await import('node:os')
      const nodePath = await import('node:path')

      const testDir = await fs.mkdtemp(
        nodePath.join(tmpdir(), 'test-github-dl-stale-'),
      )
      try {
        // Cache-invalidation path: both files present but .version
        // says a different tag than the caller asked for. Must fall
        // through to re-download.
        const binaryFile = nodePath.join(testDir, 'test-bin')
        const versionFile = nodePath.join(testDir, '.version')
        await fs.writeFile(binaryFile, 'stale-binary', 'utf8')
        await fs.writeFile(versionFile, 'v0.9.0', 'utf8')

        vi.mocked(httpRequest).mockResolvedValueOnce(
          createMockHttpResponse(
            Buffer.from(
              JSONStringify({
                assets: [
                  {
                    browser_download_url: 'https://example.com/binary',
                    name: 'test-binary',
                  },
                ],
                tag_name: 'v1.0.0',
              }),
            ),
            true,
            200,
          ),
        )
        vi.mocked(httpDownload).mockImplementationOnce(
          async (_url, outputPath) => {
            await fs.writeFile(outputPath, 'fresh-binary', 'utf8')
            return {
              headers: {},
              ok: true as const,
              path: outputPath,
              size: 12,
              status: 200,
              statusText: 'OK',
            }
          },
        )

        await downloadGitHubRelease({
          assetName: 'test-binary',
          binaryName: 'test-bin',
          downloadDir: testDir,
          owner: 'test-owner',
          platformArch: 'test-arch',
          repo: 'test-repo',
          tag: 'v1.0.0',
          toolName: 'test-tool',
        })

        expect(httpDownload).toHaveBeenCalledTimes(1)
        // Cache updated to the new tag.
        expect(await fs.readFile(versionFile, 'utf8')).toBe('v1.0.0')
      } finally {
        await safeDelete(testDir, { force: true }).catch(() => {})
      }
    })
  })
})
