import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../src/http-request/request', () => ({
  httpRequest: vi.fn(),
}))

function makeResponse(opts: { ok: boolean; status?: number; body: string }) {
  const { body, ok, status = ok ? 200 : 500 } = opts
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: {},
    body: Buffer.from(body),
    text: () => body,
    json: <T,>() => JSON.parse(body) as T,
    arrayBuffer: () => new ArrayBuffer(0),
    rawResponse: undefined,
  }
}

async function loadFresh() {
  const reqMod = await import('../../../src/http-request/request')
  const httpReqMock = reqMod.httpRequest as ReturnType<typeof vi.fn>
  const mod = await import('../../../src/http-request/node')
  return { httpReqMock, httpJson: mod.httpJson, httpText: mod.httpText }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('http-request/node — httpJson', () => {
  test('returns parsed JSON on a 2xx response', async () => {
    const { httpJson, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(
      makeResponse({ ok: true, body: JSON.stringify({ n: 1 }) }),
    )
    const result = await httpJson<{ n: number }>('https://api.example.com')
    expect(result.n).toBe(1)
  })

  test('sets Accept: application/json by default', async () => {
    const { httpJson, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(makeResponse({ ok: true, body: '{}' }))
    await httpJson('https://api.example.com')
    const callArg = httpReqMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(callArg.headers['Accept']).toBe('application/json')
    expect(callArg.headers['Content-Type']).toBeUndefined()
  })

  test('adds Content-Type: application/json when body is present', async () => {
    const { httpJson, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(makeResponse({ ok: true, body: '{}' }))
    await httpJson('https://api.example.com', {
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
    })
    const callArg = httpReqMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(callArg.headers['Content-Type']).toBe('application/json')
  })

  test('user-provided headers override defaults', async () => {
    const { httpJson, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(makeResponse({ ok: true, body: '{}' }))
    await httpJson('https://api.example.com', {
      headers: { Accept: 'application/vnd.custom+json' },
    })
    const callArg = httpReqMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(callArg.headers['Accept']).toBe('application/vnd.custom+json')
  })

  test('throws HttpResponseError when response.ok is false', async () => {
    const { httpJson, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 500, body: '{}' }),
    )
    await expect(httpJson('https://api.example.com')).rejects.toThrow()
  })

  test('throws "Failed to parse JSON response" on invalid JSON body', async () => {
    const { httpJson, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(
      makeResponse({ ok: true, body: '{not-json' }),
    )
    await expect(httpJson('https://api.example.com')).rejects.toThrow(
      /Failed to parse JSON response/,
    )
  })
})

describe.sequential('http-request/node — httpText', () => {
  test('returns the response body as text on a 2xx response', async () => {
    const { httpText, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(
      makeResponse({ ok: true, body: 'plain text' }),
    )
    expect(await httpText('https://example.com')).toBe('plain text')
  })

  test('sets Accept: text/plain by default', async () => {
    const { httpText, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(makeResponse({ ok: true, body: '' }))
    await httpText('https://example.com')
    const callArg = httpReqMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(callArg.headers['Accept']).toBe('text/plain')
    expect(callArg.headers['Content-Type']).toBeUndefined()
  })

  test('adds Content-Type: text/plain when body is present', async () => {
    const { httpText, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(makeResponse({ ok: true, body: '' }))
    await httpText('https://example.com', {
      method: 'POST',
      body: 'raw text',
    })
    const callArg = httpReqMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(callArg.headers['Content-Type']).toBe('text/plain')
  })

  test('user-provided headers override defaults', async () => {
    const { httpText, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(makeResponse({ ok: true, body: '' }))
    await httpText('https://example.com', {
      headers: { Accept: 'text/html' },
    })
    const callArg = httpReqMock.mock.calls[0]![1] as {
      headers: Record<string, string>
    }
    expect(callArg.headers['Accept']).toBe('text/html')
  })

  test('throws HttpResponseError when response.ok is false', async () => {
    const { httpText, httpReqMock } = await loadFresh()
    httpReqMock.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 404, body: 'not found' }),
    )
    await expect(httpText('https://example.com')).rejects.toThrow()
  })
})
