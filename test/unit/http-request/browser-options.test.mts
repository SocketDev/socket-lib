/**
 * @file Unit tests for the browser-safe http-request REQUEST OPTIONS:
 *   `followRedirects`, `maxResponseSize`, `hooks`, and `timeout`. Split out of
 *   `./browser.test.mts`, which covers the request/response surface itself and
 *   had grown past the file-size cap. Same mocking approach as its sibling: the
 *   `fetchResponse` helper module is mocked rather than `globalThis.fetch`, so
 *   the project's nock-based setup does not interfere.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { minTimerQuantum } from '../../_shared/fleet/lib/timing.mts'

vi.mock(import('../../../src/http-request/fetch/browser.mjs'), () => ({
  fetchResponse: vi.fn(),
}))

interface MockResponseInit {
  status?: number | undefined
  statusText?: string | undefined
  headers?: Record<string, string> | undefined
  body?: string | undefined
}

function mockFetchResponse(init: MockResponseInit = {}): Response {
  return new Response(init.body ?? '', {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: init.headers ?? {},
  })
}

async function loadFresh() {
  const fetchMod = await import('../../../src/http-request/fetch/browser.mjs')
  const mod = await import('../../../src/http-request/browser.mjs')
  return {
    fetchSpy: fetchMod.fetchResponse as ReturnType<typeof vi.fn>,
    httpRequest: mod.httpRequest,
  }
}

describe.sequential('http-request/browser options', () => {
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

  describe('option: followRedirects', () => {
    it('passes redirect:manual when followRedirects is false', async () => {
      await httpRequest('https://api.example.com/x', { followRedirects: false })
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect(init.redirect).toBe('manual')
    })

    it('omits redirect option when followRedirects is true (default)', async () => {
      await httpRequest('https://api.example.com/x')
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect(init.redirect).toBeUndefined()
    })
  })

  describe('option: maxResponseSize', () => {
    it('throws when response exceeds maxResponseSize', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ body: 'x'.repeat(1000) }),
      )
      await expect(
        httpRequest('https://api.example.com/x', { maxResponseSize: 100 }),
      ).rejects.toThrow(/exceeds maxResponseSize/)
    })

    it('allows response within maxResponseSize', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'hi' }))
      const r = await httpRequest('https://api.example.com/x', {
        maxResponseSize: 100,
      })
      expect(r.text()).toBe('hi')
    })
  })

  describe('option: hooks', () => {
    it('fires onRequest with method, url, headers, timeout', async () => {
      const onRequest = vi.fn()
      await httpRequest('https://api.example.com/x', {
        method: 'POST',
        headers: { 'X-Trace': 'abc' },
        timeout: 5000,
        hooks: { onRequest },
      })
      expect(onRequest).toHaveBeenCalledTimes(1)
      expect(onRequest.mock.calls[0]?.[0]).toMatchObject({
        method: 'POST',
        url: 'https://api.example.com/x',
        headers: { 'X-Trace': 'abc' },
        timeout: 5000,
      })
    })

    it('fires onResponse with status/statusText/headers/duration', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({
          status: 200,
          statusText: 'OK',
          body: 'ok',
          headers: { 'X-Trace-Resp': 'xyz' },
        }),
      )
      const onResponse = vi.fn()
      await httpRequest('https://api.example.com/x', {
        hooks: { onResponse },
      })
      expect(onResponse).toHaveBeenCalledTimes(1)
      const info = onResponse.mock.calls[0]?.[0]
      expect(info.status).toBe(200)
      expect(info.statusText).toBe('OK')
      expect(info.headers['x-trace-resp']).toBe('xyz')
      expect(typeof info.duration).toBe('number')
      expect(info.error).toBeUndefined()
    })

    it('fires onResponse with error on network failure', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network'))
      const onResponse = vi.fn()
      await expect(
        httpRequest('https://api.example.com/x', { hooks: { onResponse } }),
      ).rejects.toThrow('network')
      expect(onResponse).toHaveBeenCalledTimes(1)
      expect(onResponse.mock.calls[0]?.[0].error).toBeInstanceOf(Error)
    })
  })

  describe('option: timeout', () => {
    it('aborts the fetch if the timeout elapses', async () => {
      // Fetch never resolves until the abort signal fires.
      fetchSpy.mockImplementationOnce(
        (_input, init) =>
          new Promise((_, reject) => {
            const signal = init?.signal as AbortSignal
            signal.addEventListener('abort', () =>
              reject(new Error('AbortError')),
            )
          }),
      )
      await expect(
        httpRequest('https://api.example.com/x', { timeout: 10 }),
      ).rejects.toThrow()
    })

    it('combines an already-aborted external signal with a timeout', async () => {
      const controller = new AbortController()
      controller.abort()
      fetchSpy.mockImplementationOnce(
        (_input, init) =>
          new Promise((_, reject) => {
            const signal = init?.signal as AbortSignal
            if (signal.aborted) {
              reject(new Error('AbortError'))
              return
            }
            signal.addEventListener('abort', () =>
              reject(new Error('AbortError')),
            )
          }),
      )
      await expect(
        httpRequest('https://api.example.com/x', {
          signal: controller.signal,
          timeout: 1000,
        }),
      ).rejects.toThrow()
    })

    it('combines an active external signal with a timeout (cleanup path)', async () => {
      const controller = new AbortController()
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'ok' }))
      const result = await httpRequest('https://api.example.com/x', {
        signal: controller.signal,
        timeout: 1000,
      })
      expect(result.body).toBeInstanceOf(Uint8Array)
    })

    it('aborts external signal mid-flight (registers listener path)', async () => {
      const controller = new AbortController()
      fetchSpy.mockImplementationOnce(
        (_input, init) =>
          new Promise((_, reject) => {
            const signal = init?.signal as AbortSignal
            signal.addEventListener('abort', () => reject(new Error('aborted')))
            setTimeout(() => controller.abort(), minTimerQuantum(5))
          }),
      )
      await expect(
        httpRequest('https://api.example.com/x', {
          signal: controller.signal,
          timeout: 5000,
        }),
      ).rejects.toThrow()
    })

    it('coerces non-Error throwables in onResponse hook', async () => {
      fetchSpy.mockImplementationOnce(() => {
        throw 'string-error'
      })
      const onResponse = vi.fn()
      await expect(
        httpRequest('https://api.example.com/x', { hooks: { onResponse } }),
      ).rejects.toBeDefined()
      // onResponse was called with an Error wrapping the string
      expect(onResponse).toHaveBeenCalled()
      const arg = onResponse.mock.calls[0]![0] as { error?: Error | undefined }
      expect(arg.error).toBeInstanceOf(Error)
      expect(arg.error?.message).toBe('string-error')
    })

    it('falls back to generic Error when lastError is non-Error after exhausted retries', async () => {
      fetchSpy.mockImplementation(() => {
        throw 'literal-error'
      })
      await expect(
        httpRequest('https://api.example.com/x', {
          retries: 1,
          retryDelay: 1,
        }),
      ).rejects.toThrow()
    })
  })
})
