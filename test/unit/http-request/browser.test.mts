/**
 * @file Unit tests for browser-safe http-request layer. Mocks the `doFetch`
 *   helper module (not globalThis.fetch) so the project's nock-based test setup
 *   doesn't interfere.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { minTimerQuantum } from '../../_shared/fleet/lib/timing.mts'

vi.mock(import('../../../src/http-request/browser-fetch'), () => ({
  doFetch: vi.fn(),
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
  const fetchMod = await import('../../../src/http-request/browser-fetch')
  const mod = await import('../../../src/http-request/browser')
  return {
    fetchSpy: fetchMod.doFetch as ReturnType<typeof vi.fn>,
    HttpResponseError: mod.HttpResponseError,
    httpJson: mod.httpJson,
    httpRequest: mod.httpRequest,
    httpText: mod.httpText,
  }
}

describe.sequential('http-request/browser', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  let HttpResponseError: Awaited<
    ReturnType<typeof loadFresh>
  >['HttpResponseError']
  let httpJson: Awaited<ReturnType<typeof loadFresh>>['httpJson']
  let httpRequest: Awaited<ReturnType<typeof loadFresh>>['httpRequest']
  let httpText: Awaited<ReturnType<typeof loadFresh>>['httpText']

  beforeEach(async () => {
    vi.resetModules()
    const fresh = await loadFresh()
    fetchSpy = fresh.fetchSpy
    fetchSpy.mockImplementation(async () => mockFetchResponse({ body: '{}' }))
    HttpResponseError = fresh.HttpResponseError
    httpJson = fresh.httpJson
    httpRequest = fresh.httpRequest
    httpText = fresh.httpText
  })

  afterEach(() => {
    vi.clearAllMocks()
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
        const err = e as InstanceType<typeof HttpResponseError>
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
        // eslint-disable-next-line @typescript-eslint/only-throw-error
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
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      fetchSpy.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
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

  describe('BrowserHttpResponse methods', () => {
    it('arrayBuffer() returns the underlying ArrayBuffer', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'hello' }))
      const r = await httpRequest('https://api.example.com/x')
      const buf = r.arrayBuffer()
      expect(buf).toBeInstanceOf(ArrayBuffer)
      expect(buf.byteLength).toBe(5)
      expect(new TextDecoder().decode(new Uint8Array(buf))).toBe('hello')
    })

    it('arrayBuffer() returns the same buffer across calls', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'stable' }))
      const r = await httpRequest('https://api.example.com/x')
      expect(r.arrayBuffer()).toBe(r.arrayBuffer())
    })

    it('json() throws when body is not valid JSON', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ body: '{not valid json' }),
      )
      const r = await httpRequest('https://api.example.com/x')
      expect(() => r.json()).toThrow()
    })

    it('text() decodes UTF-8 multi-byte sequences', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse({ body: 'héllo 🌍' }))
      const r = await httpRequest('https://api.example.com/x')
      expect(r.text()).toBe('héllo 🌍')
    })
  })

  describe('HttpResponseError message construction', () => {
    it('uses default message when none provided', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 503, statusText: 'Service Unavailable' }),
      )
      try {
        await httpJson('https://api.example.com/x')
        expect.fail('expected throw')
      } catch (e) {
        const err = e as InstanceType<typeof HttpResponseError>
        expect(err.message).toBe('HTTP 503: Service Unavailable')
      }
    })

    it('uses provided message when constructed manually', () => {
      const fakeResp = {
        body: new Uint8Array(),
        headers: {},
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: 'https://x',
        arrayBuffer: () => new ArrayBuffer(0),
        json: <T,>() => undefined as T,
        text: () => '',
      }
      const err = new HttpResponseError(fakeResp, 'custom message')
      expect(err.message).toBe('custom message')
      expect(err.response).toBe(fakeResp)
    })

    it('falls back to "No status message" when statusText is empty', () => {
      const fakeResp = {
        body: new Uint8Array(),
        headers: {},
        ok: false,
        status: 500,
        statusText: '',
        url: 'https://x',
        arrayBuffer: () => new ArrayBuffer(0),
        json: <T,>() => undefined as T,
        text: () => '',
      }
      const err = new HttpResponseError(fakeResp)
      expect(err.message).toBe('HTTP 500: No status message')
    })

    it('falls back to "unknown" when status is undefined', () => {
      const fakeResp = {
        body: new Uint8Array(),
        headers: {},
        ok: false,
        // Status nulled to exercise the `?? 'unknown'` branch.
        status: undefined as unknown as number,
        statusText: 'Mystery',
        url: 'https://x',
        arrayBuffer: () => new ArrayBuffer(0),
        json: <T,>() => undefined as T,
        text: () => '',
      }
      const err = new HttpResponseError(fakeResp)
      expect(err.message).toBe('HTTP unknown: Mystery')
    })
  })
})
