/**
 * @file Unit tests for GitHub `getLatestRelease`. Covers REST + GraphQL
 *   fallback, asset filtering, and date-sorting.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLatestRelease } from '../../../src/releases/github-listing'
import { SOCKET_BTM_REPO } from '../../../src/releases/socket-btm'

import { httpRequest } from '../../../src/http-request/request'

import { createMockHttpResponse } from '../util/http-mock'

// Mock httpRequest so tests don't issue real network calls.
vi.mock(import('../../../src/http-request/request'))

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
})
