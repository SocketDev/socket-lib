import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../../src/http-request/request-attempt', () => ({
  httpRequestAttempt: vi.fn(),
}))

async function loadFresh() {
  const attemptMod = await import('../../../src/http-request/request-attempt')
  const mod = await import('../../../src/http-request/request')
  const errMod = await import('../../../src/http-request/response-types')
  return {
    httpRequestAttempt: attemptMod.httpRequestAttempt as ReturnType<
      typeof vi.fn
    >,
    httpRequest: mod.httpRequest,
    HttpResponseError: errMod.HttpResponseError,
  }
}

function makeResponse(opts: { ok: boolean; status?: number }) {
  const { ok, status = ok ? 200 : 500 } = opts
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: {},
    body: Buffer.from(''),
    text: () => '',
    json: () => ({}),
    arrayBuffer: () => new ArrayBuffer(0),
    rawResponse: undefined,
  }
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe.sequential('http-request/request — happy path', () => {
  test('returns the response on the first successful attempt', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    const resp = makeResponse({ ok: true })
    httpRequestAttempt.mockResolvedValueOnce(resp)
    expect(await httpRequest('https://example.com')).toBe(resp)
    expect(httpRequestAttempt).toHaveBeenCalledTimes(1)
  })

  test('passes through standard options to httpRequestAttempt', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt.mockResolvedValueOnce(makeResponse({ ok: true }))
    await httpRequest('https://example.com', {
      method: 'POST',
      headers: { 'X-Foo': 'bar' },
      body: 'payload',
      timeout: 5000,
    })
    const [, opts] = httpRequestAttempt.mock.calls[0]!
    expect(opts.method).toBe('POST')
    expect(opts.headers).toEqual({ 'X-Foo': 'bar' })
    expect(opts.body).toBe('payload')
    expect(opts.timeout).toBe(5000)
  })

  test('passes AbortSignal through to httpRequestAttempt', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt.mockResolvedValueOnce(makeResponse({ ok: true }))
    const controller = new AbortController()
    await httpRequest('https://example.com', { signal: controller.signal })
    const [, opts] = httpRequestAttempt.mock.calls[0]!
    expect(opts.signal).toBe(controller.signal)
  })
})

describe.sequential('http-request/request — stream body guard', () => {
  test('throws when a Readable-shaped body is combined with retries > 0', async () => {
    const { httpRequest } = await loadFresh()
    const streamBody = { pipe: () => {} }
    await expect(
      httpRequest('https://example.com', {
        body: streamBody as never,
        retries: 2,
      }),
    ).rejects.toThrow(/Streaming body.*cannot be used with retries/)
  })

  test('forces followRedirects:false when body is stream-shaped', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt.mockResolvedValueOnce(makeResponse({ ok: true }))
    const streamBody = { pipe: () => {} }
    await httpRequest('https://example.com', {
      body: streamBody as never,
      followRedirects: true,
    })
    const [, opts] = httpRequestAttempt.mock.calls[0]!
    expect(opts.followRedirects).toBe(false)
  })
})

describe.sequential('http-request/request — throwOnError', () => {
  test('wraps a non-OK response in HttpResponseError when throwOnError is true', async () => {
    const { HttpResponseError, httpRequest, httpRequestAttempt } =
      await loadFresh()
    httpRequestAttempt.mockResolvedValueOnce(
      makeResponse({ ok: false, status: 500 }),
    )
    await expect(
      httpRequest('https://example.com', { throwOnError: true }),
    ).rejects.toBeInstanceOf(HttpResponseError)
  })

  test('returns a non-OK response unchanged when throwOnError is false (default)', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    const resp = makeResponse({ ok: false, status: 500 })
    httpRequestAttempt.mockResolvedValueOnce(resp)
    expect(await httpRequest('https://example.com')).toBe(resp)
  })
})

describe.sequential('http-request/request — retry loop', () => {
  test('retries after a failure, then returns the success', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(makeResponse({ ok: true }))
    const resp = await httpRequest('https://example.com', {
      retries: 1,
      retryDelay: 0,
    })
    expect(resp.ok).toBe(true)
    expect(httpRequestAttempt).toHaveBeenCalledTimes(2)
  })

  test('throws the last error when all retries are exhausted', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt.mockRejectedValue(new Error('persistent'))
    await expect(
      httpRequest('https://example.com', { retries: 2, retryDelay: 0 }),
    ).rejects.toThrow('persistent')
    expect(httpRequestAttempt).toHaveBeenCalledTimes(3)
  })

  test('onRetry callback is invoked with attempt number + error + delay', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(makeResponse({ ok: true }))
    const onRetry = vi.fn()
    await httpRequest('https://example.com', {
      retries: 1,
      retryDelay: 0,
      onRetry,
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0]![0]).toBe(1)
    expect((onRetry.mock.calls[0]![1] as Error).message).toBe('first')
    expect(typeof onRetry.mock.calls[0]![2]).toBe('number')
  })

  test('onRetry returning false stops the loop and rethrows', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt.mockRejectedValue(new Error('boom'))
    const onRetry = vi.fn().mockReturnValue(false)
    await expect(
      httpRequest('https://example.com', {
        retries: 5,
        retryDelay: 0,
        onRetry,
      }),
    ).rejects.toThrow('boom')
    expect(httpRequestAttempt).toHaveBeenCalledTimes(1)
  })

  test('onRetry returning a number overrides the default delay', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(makeResponse({ ok: true }))
    const onRetry = vi.fn().mockReturnValue(0)
    await httpRequest('https://example.com', {
      retries: 1,
      retryDelay: 60_000,
      onRetry,
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('onRetry returning NaN falls back to computed exponential delay', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(makeResponse({ ok: true }))
    const onRetry = vi.fn().mockReturnValue(Number.NaN)
    await httpRequest('https://example.com', {
      retries: 1,
      retryDelay: 0,
      onRetry,
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('onRetry returning a negative number is clamped to 0', async () => {
    const { httpRequest, httpRequestAttempt } = await loadFresh()
    httpRequestAttempt
      .mockRejectedValueOnce(new Error('first'))
      .mockResolvedValueOnce(makeResponse({ ok: true }))
    const onRetry = vi.fn().mockReturnValue(-9999)
    await httpRequest('https://example.com', {
      retries: 1,
      retryDelay: 60_000,
      onRetry,
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe.sequential('http-request/request — re-exports', () => {
  test('re-exports httpRequestAttempt and readIncomingResponse from the leaves', async () => {
    const mod = await import('../../../src/http-request/request')
    expect(typeof mod.httpRequestAttempt).toBe('function')
    expect(typeof mod.readIncomingResponse).toBe('function')
  })
})
