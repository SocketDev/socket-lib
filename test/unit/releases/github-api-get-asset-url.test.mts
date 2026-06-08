/**
 * @file Unit tests for GitHub `getReleaseAssetUrl`. Covers REST + GraphQL
 *   fallback for per-tag asset URL discovery.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { tolerantTimeout } from '../../_shared/fleet/lib/timing.mts'

import { getReleaseAssetUrl } from '../../../src/releases/github-asset-url'
import { SOCKET_BTM_REPO } from '../../../src/releases/socket-btm'

import { httpRequest } from '../../../src/http-request/request'

import { createMockHttpResponse } from '../util/http-mock'

vi.mock(import('../../../src/http-request/request'))

const JSONStringify = JSON.stringify

describe.sequential('releases/github-api: getReleaseAssetUrl', () => {
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

  it(
    'should throw when REST per-tag returns non-ok status',
    async () => {
      // Force pRetry to bypass timing for this test.
      vi.useFakeTimers()
      try {
        vi.mocked(httpRequest).mockResolvedValue(
          createMockHttpResponse(Buffer.from(''), false, 404),
        )
        const promise = getReleaseAssetUrl(
          'v1.0.0',
          '*.tar.gz',
          SOCKET_BTM_REPO,
        )
        await vi.runAllTimersAsync()
        await expect(promise).rejects.toThrow(
          /Failed to fetch.*release v1\.0\.0/,
        )
      } finally {
        vi.useRealTimers()
      }
    },
    tolerantTimeout(30_000),
  )

  it(
    'should throw error when pattern does not match any asset',
    async () => {
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
    },
    tolerantTimeout(40_000),
  )
})
