/**
 * @fileoverview Unit tests for GitHub `getLatestRelease`.
 *
 * Covers REST + GraphQL fallback, asset filtering, and date-sorting.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLatestRelease } from '../../src/releases/github-api'
import { SOCKET_BTM_REPO } from '../../src/releases/socket-btm'

import { httpRequest } from '../../src/http-request'

import { createMockHttpResponse } from './utils/http-mock'

// Mock httpRequest so tests don't issue real network calls.
vi.mock('../../src/http-request')

// Match the production source's primordials convention.
const JSONStringify = JSON.stringify

describe.sequential('releases/github-api: getLatestRelease', () => {
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
      .mockResolvedValueOnce(createMockHttpResponse(Buffer.from(''), true, 200))
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
      createMockHttpResponse(Buffer.from('Internal Server Error'), false, 503),
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
      return createMockHttpResponse(Buffer.from('not valid json {'), true, 200)
    })

    await expect(getLatestRelease('curl-', SOCKET_BTM_REPO)).rejects.toThrow(
      /both REST and GraphQL backends degraded/,
    )
  }, 60_000)
})
