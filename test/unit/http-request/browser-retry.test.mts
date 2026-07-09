/**
 * @file Retry + backoff tests for the browser-safe http-request layer (split
 *   from browser.test.mts to stay under the file-size cap). Mocks the
 *   `fetchResponse` helper module so the project's nock-based test setup
 *   doesn't interfere.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('../../../src/http-request/fetch/browser'), () => ({
  fetchResponse: vi.fn(),
}))

function mockFetchResponse(
  init: { body?: string | undefined; status?: number | undefined } = {},
): Response {
  return new Response(init.body ?? '', {
    status: init.status ?? 200,
    statusText: 'OK',
  })
}

async function loadFresh() {
  const fetchMod = await import('../../../src/http-request/fetch/browser')
  const mod = await import('../../../src/http-request/browser')
  return {
    fetchSpy: fetchMod.fetchResponse as ReturnType<typeof vi.fn>,
    httpRequest: mod.httpRequest,
  }
}

describe.sequential('http-request/browser retry', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  let httpRequest: Awaited<ReturnType<typeof loadFresh>>['httpRequest']

  beforeEach(async () => {
    vi.resetModules()
    const fresh = await loadFresh()
    fetchSpy = fresh.fetchSpy
    fetchSpy.mockImplementation(async () => mockFetchResponse({ body: '{}' }))
    httpRequest = fresh.httpRequest
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('retries on 5xx when retries > 0', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockFetchResponse({ status: 500 }))
      .mockResolvedValueOnce(mockFetchResponse({ status: 200, body: 'ok' }))
    const r = await httpRequest('https://api.example.com/x', {
      retries: 1,
      retryDelay: 1,
    })
    expect(r.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('caps the retry backoff at retryDelayMax', async () => {
    // Fire setTimeout synchronously and record each requested delay, so the cap
    // is asserted without real waits.
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((fn: () => void) => {
        fn()
        return 0 as unknown as ReturnType<typeof setTimeout>
      }) as unknown as typeof setTimeout)
    try {
      // Fresh response per attempt — each read consumes the body once.
      fetchSpy.mockImplementation(async () =>
        mockFetchResponse({ status: 500 }),
      )
      const r = await httpRequest('https://api.example.com/x', {
        retries: 3,
        retryDelay: 100_000,
        retryDelayMax: 500,
      })
      expect(r.status).toBe(500)
      // 3 retries → 3 backoff sleeps, each min(100000 * 2^i, 500) = 500.
      const delays = setTimeoutSpy.mock.calls.map(c => c[1])
      expect(delays).toStrictEqual([500, 500, 500])
    } finally {
      setTimeoutSpy.mockRestore()
    }
  })
})
