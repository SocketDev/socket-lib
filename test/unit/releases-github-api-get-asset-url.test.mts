/**
 * @fileoverview Unit tests for GitHub `getReleaseAssetUrl`.
 *
 * Covers REST + GraphQL fallback for per-tag asset URL discovery.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getReleaseAssetUrl } from '../../src/releases/github-api'
import { SOCKET_BTM_REPO } from '../../src/releases/socket-btm'

import { httpRequest } from '../../src/http-request'

import { createMockHttpResponse } from './utils/http-mock'

vi.mock('../../src/http-request')

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
