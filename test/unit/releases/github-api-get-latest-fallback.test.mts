/**
 * @file Unit tests for GitHub `getLatestRelease` GraphQL fallback + error
 *   surfaces. Covers the REST-degraded → GraphQL re-query path and the
 *   transport/parse failure modes. REST happy-path matching + date-sorting
 *   live in `github-api-get-latest.test.mts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getLatestRelease } from '../../../src/releases/github-listing'
import { SOCKET_BTM_REPO } from '../../../src/releases/socket-btm'

import { httpRequest } from '../../../src/http-request/request'

import { createMockHttpResponse } from '../util/http-mock'

// Mock httpRequest so tests don't issue real network calls.
vi.mock(import('../../../src/http-request/request'))

// Match the production source's primordials convention.
const JSONStringify = JSON.stringify

describe.sequential('releases/github-api: getLatestRelease (GraphQL fallback)', () => {
  afterEach(() => {
    // resetAllMocks clears mockImplementation as well as call
    // history; the fallback tests below set `mockImplementation`
    // for pRetry-aware mocking and that must not leak into later
    // tests.
    vi.resetAllMocks()
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

    // Use fake timers so pRetry's exponential backoff doesn't burn wallclock.
    vi.useFakeTimers()
    try {
      const promise = getLatestRelease('whatever-', SOCKET_BTM_REPO)
      await vi.runAllTimersAsync()
      // GraphQL errors[] now wraps in the "both transports failed"
      // surface error. The original GraphQL message lives in .cause.
      await expect(promise).rejects.toThrow(
        /Failed to list SocketDev\/socket-btm releases: both REST and GraphQL backends degraded/,
      )
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)

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

    vi.useFakeTimers()
    try {
      const promise = getLatestRelease('curl-', SOCKET_BTM_REPO)
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toThrow(
        /Failed to fetch SocketDev\/socket-btm releases: 503/,
      )
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)

  it('should throw on REST malformed JSON body', async () => {
    // 200 OK but the body isn't valid JSON. The helper wraps the
    // SyntaxError in a clear "Failed to parse" surface error.
    vi.mocked(httpRequest).mockResolvedValue(
      createMockHttpResponse(Buffer.from('<html>not json</html>'), true, 200),
    )

    vi.useFakeTimers()
    try {
      const promise = getLatestRelease('curl-', SOCKET_BTM_REPO)
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toThrow(
        /Failed to parse SocketDev\/socket-btm releases response/,
      )
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)

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

    vi.useFakeTimers()
    try {
      const promise = getLatestRelease('curl-', SOCKET_BTM_REPO)
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toThrow(
        /both REST and GraphQL backends degraded/,
      )
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)

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

    vi.useFakeTimers()
    try {
      const promise = getLatestRelease('curl-', SOCKET_BTM_REPO)
      await vi.runAllTimersAsync()
      await expect(promise).rejects.toThrow(
        /both REST and GraphQL backends degraded/,
      )
    } finally {
      vi.useRealTimers()
    }
  }, 30_000)
})
