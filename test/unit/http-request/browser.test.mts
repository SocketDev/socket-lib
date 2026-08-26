/**
 * @file Unit tests for browser-safe http-request layer. Mocks the
 *   `fetchResponse` helper module (not globalThis.fetch) so the project's
 *   nock-based test setup doesn't interfere.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    HttpResponseError: mod.HttpResponseError,
    httpBytes: mod.httpBytes,
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
  let httpBytes: Awaited<ReturnType<typeof loadFresh>>['httpBytes']
  let httpJson: Awaited<ReturnType<typeof loadFresh>>['httpJson']
  let httpRequest: Awaited<ReturnType<typeof loadFresh>>['httpRequest']
  let httpText: Awaited<ReturnType<typeof loadFresh>>['httpText']

  beforeEach(async () => {
    vi.resetModules()
    const fresh = await loadFresh()
    fetchSpy = fresh.fetchSpy
    fetchSpy.mockImplementation(async () => mockFetchResponse({ body: '{}' }))
    HttpResponseError = fresh.HttpResponseError
    httpBytes = fresh.httpBytes
    httpJson = fresh.httpJson
    httpRequest = fresh.httpRequest
    httpText = fresh.httpText
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('httpBytes', () => {
    it('returns the raw body bytes undecoded', async () => {
      // A byte run that is not valid UTF-8. Text decoding would substitute
      // U+FFFD and change the length; these bytes must survive intact.
      const raw = new Uint8Array([0x1f, 0x8b, 0x08, 0xc3, 0x28])
      fetchSpy.mockResolvedValueOnce(new Response(raw, { status: 200 }))
      const bytes = await httpBytes('https://registry.example.test/tarball')
      expect(Array.from(bytes)).toEqual([0x1f, 0x8b, 0x08, 0xc3, 0x28])
    })

    it('sets Accept: application/octet-stream by default', async () => {
      await httpBytes('https://api.example.com/blob')
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>)['Accept']).toBe(
        'application/octet-stream',
      )
    })

    it('lets a caller override Accept and add auth', async () => {
      await httpBytes('https://api.example.com/blob', {
        headers: { Accept: 'application/gzip', Authorization: 'Bearer tok' },
      })
      const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers['Accept']).toBe('application/gzip')
      expect(headers['Authorization']).toBe('Bearer tok')
    })

    it('throws HttpResponseError on a non-2xx status', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse({ status: 404, statusText: 'Not Found' }),
      )
      await expect(httpBytes('https://api.example.com/blob')).rejects.toThrow(
        HttpResponseError,
      )
    })
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
        // oxlint-disable-next-line socket/no-error-message-assertions -- format
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
      // oxlint-disable-next-line socket/no-error-message-assertions -- echo
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
      // oxlint-disable-next-line socket/no-error-message-assertions -- builder
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
      // oxlint-disable-next-line socket/no-error-message-assertions -- builder
      expect(err.message).toBe('HTTP unknown: Mystery')
    })
  })
})
