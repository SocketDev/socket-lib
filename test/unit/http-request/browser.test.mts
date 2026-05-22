/**
 * @file Unit tests for browser-safe http-request layer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HttpResponseError,
  httpJson,
  httpRequest,
  httpText,
} from '../../../src/http-request/browser'

interface MockResponseInit {
  status?: number
  statusText?: string
  headers?: Record<string, string>
  body?: string
}

function mockFetchResponse(init: MockResponseInit = {}): Response {
  return new Response(init.body ?? '', {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: init.headers ?? {},
  })
}

// Tests run sequentially because they share globalThis.fetch state — vi.spyOn
// can't reliably intercept due to nock's monkey-patch from the global test
// setup, so we replace fetch wholesale each beforeEach.
describe.sequential('http-request/browser', () => {
  let fetchSpy: import('vitest').MockInstance
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    const mock = vi.fn(async () => mockFetchResponse({ body: '{}' }))
    globalThis.fetch = mock as unknown as typeof globalThis.fetch
    fetchSpy = mock as unknown as import('vitest').MockInstance
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('httpRequest', () => {
    it('GETs by default', async () => {
      await httpRequest('https://api.example.com/data')
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect(init.method).toBe('GET')
    })

    it('honors custom method', async () => {
      await httpRequest('https://api.example.com/x', { method: 'DELETE' })
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect(init.method).toBe('DELETE')
    })

    it('returns Uint8Array body', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'hello' }))
      const r = await httpRequest('https://api.example.com/x')
      expect(r.body).toBeInstanceOf(Uint8Array)
      expect(r.text()).toBe('hello')
    })

    it('lowercases header keys', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      const r = await httpRequest('https://api.example.com/x')
      expect(r.headers['content-type']).toBe('application/json')
    })

    it('returns non-ok responses without throwing by default', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 404, statusText: 'Not Found' }),
      )
      const r = await httpRequest('https://api.example.com/x')
      expect(r.ok).toBe(false)
      expect(r.status).toBe(404)
    })

    it('throws HttpResponseError when throwOnError is true and status is not 2xx', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 500, statusText: 'Server Error' }),
      )
      await expect(
        httpRequest('https://api.example.com/x', { throwOnError: true }),
      ).rejects.toBeInstanceOf(HttpResponseError)
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
  })

  describe('httpJson', () => {
    it('sets Accept: application/json by default', async () => {
      await httpJson('https://api.example.com/x')
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>)['Accept']).toBe(
        'application/json',
      )
    })

    it('sets Content-Type when body is present', async () => {
      await httpJson('https://api.example.com/x', {
        method: 'POST',
        body: '{"k": 1}',
      })
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      )
    })

    it('parses JSON response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ body: '{"key": "value"}' }),
      )
      const r = await httpJson<{ key: string }>('https://api.example.com/x')
      expect(r.key).toBe('value')
    })

    it('throws HttpResponseError on non-2xx', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 403, statusText: 'Forbidden' }),
      )
      await expect(
        httpJson('https://api.example.com/x'),
      ).rejects.toBeInstanceOf(HttpResponseError)
    })

    it('user-provided Accept header wins over default', async () => {
      await httpJson('https://api.example.com/x', {
        headers: { Accept: 'text/plain' },
      })
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>)['Accept']).toBe(
        'text/plain',
      )
    })
  })

  describe('httpText', () => {
    it('returns body as string', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'hello world' }))
      const r = await httpText('https://api.example.com/x')
      expect(r).toBe('hello world')
    })

    it('throws HttpResponseError on non-2xx', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 404, statusText: 'Not Found' }),
      )
      await expect(
        httpText('https://api.example.com/x'),
      ).rejects.toBeInstanceOf(HttpResponseError)
    })
  })

  describe('HttpResponseError', () => {
    it('exposes response on the error', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 418, statusText: "I'm a teapot" }),
      )
      try {
        await httpJson('https://api.example.com/x')
        expect.fail('expected throw')
      } catch (e) {
        expect(e).toBeInstanceOf(HttpResponseError)
        const err = e as HttpResponseError
        expect(err.response.status).toBe(418)
        expect(err.response.statusText).toBe("I'm a teapot")
        expect(err.name).toBe('HttpResponseError')
      }
    })
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
  })
})
