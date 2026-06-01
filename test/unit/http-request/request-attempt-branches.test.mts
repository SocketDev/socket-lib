/**
 * @file Branch-coverage tests for src/http-request/request-attempt.ts. Mocks
 *   the underlying `node:http` module via the `_internal` getter so we can
 *   trigger rejectOnce body-destroy + signal pass-through arms without real
 *   network. Sits alongside `request.test.mts` which mocks at a higher level.
 */

import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { httpStub, httpsStub } = vi.hoisted(() => ({
  httpStub: { request: vi.fn() },
  httpsStub: { request: vi.fn() },
}))

vi.mock(import('../../../src/http-request/_internal'), () => ({
  getHttp: () => httpStub,
  getHttps: () => httpsStub,
  getCrypto: () => require('node:crypto'),
  getFs: () => require('node:fs'),
}))

interface FakeClientRequest extends EventEmitter {
  end: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  setHeader?: ReturnType<typeof vi.fn> | undefined
}

function makeFakeRequest(): FakeClientRequest {
  const req = new EventEmitter() as FakeClientRequest
  req.end = vi.fn()
  req.destroy = vi.fn()
  ;(req as unknown as { write: () => void }).write = vi.fn()
  return req
}

beforeEach(() => {
  httpStub.request.mockReset()
  httpsStub.request.mockReset()
  vi.resetModules()
})

afterEach(() => {
  vi.clearAllMocks()
})

async function loadAttempt() {
  return await import('../../../src/http-request/request-attempt')
}

describe.sequential('request-attempt — body cleanup on error', () => {
  test('destroys a streaming body when the request errors before settle', async () => {
    const fakeReq = makeFakeRequest()
    httpStub.request.mockImplementation(() => {
      queueMicrotask(() => fakeReq.emit('error', new Error('socket-died')))
      return fakeReq
    })

    const destroy = vi.fn()
    // String body with a destroy method — exercises the body-cleanup arm in
    // rejectOnce without invoking the streaming pipe path. The function only
    // checks `typeof body.destroy === 'function'`, not the body shape.
    const bodyWithDestroy = Object.assign(Object.create(null), {
      destroy,
      toString: () => '',
    })
    const onResponse = vi.fn()

    const { httpRequestAttempt } = await loadAttempt()
    await expect(
      httpRequestAttempt('http://example.com/x', {
        body: bodyWithDestroy as never,
        hooks: { onResponse },
      }),
    ).rejects.toThrow(/request failed/i)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
      }),
    )
  })

  test('passes AbortSignal through to request options', async () => {
    const fakeReq = makeFakeRequest()
    httpStub.request.mockImplementation(
      (opts: Record<string, unknown>, _cb: unknown) => {
        // Capture the opts for assertion; settle with an error so the promise
        // resolves cleanly without needing a full response simulation.
        ;(httpStub.request as { lastOpts?: unknown | undefined }).lastOpts =
          opts
        queueMicrotask(() => fakeReq.emit('error', new Error('done')))
        return fakeReq
      },
    )

    const controller = new AbortController()
    const { httpRequestAttempt } = await loadAttempt()
    await expect(
      httpRequestAttempt('http://example.com/y', {
        signal: controller.signal,
      }),
    ).rejects.toThrow(/request failed/i)
    const captured = (
      httpStub.request as unknown as { lastOpts: Record<string, unknown> }
    ).lastOpts
    expect(captured['signal']).toBe(controller.signal)
  })

  test('hook errors during onResponse are swallowed (does not pend the promise)', async () => {
    const fakeReq = makeFakeRequest()
    httpStub.request.mockImplementation(() => {
      queueMicrotask(() => fakeReq.emit('error', new Error('boom')))
      return fakeReq
    })

    const { httpRequestAttempt } = await loadAttempt()
    await expect(
      httpRequestAttempt('http://example.com/z', {
        hooks: {
          onResponse: () => {
            throw new Error('hook-explodes')
          },
        },
      }),
    ).rejects.toThrow(/request failed/i)
  })
})
