/**
 * @file `HttpResponseError`, the error `throwOnError` raises. Its message is
 *   assembled from three fields that may each be missing, and callers read the
 *   attached response rather than parsing the text, so both halves of every
 *   fallback are pinned here.
 */

import { describe, expect, it } from 'vitest'

import { HttpResponseError } from '../../../src/http-request/response-types.mjs'

import type { HttpResponse } from '../../../src/http-request/response-types.mjs'

function response(overrides?: Partial<HttpResponse> | undefined): HttpResponse {
  return {
    arrayBuffer: () => new ArrayBuffer(0),
    body: Buffer.alloc(0),
    headers: {},
    json: <T = unknown,>() => undefined as T,
    ok: false,
    status: 503,
    statusText: 'Service Unavailable',
    text: () => '',
    ...overrides,
  }
}

describe('HttpResponseError', () => {
  it('is an Error, so a caller catching Error still sees it', () => {
    expect(new HttpResponseError(response())).toBeInstanceOf(Error)
  })

  it('carries a stable name to switch on', () => {
    expect(new HttpResponseError(response()).name).toBe('HttpResponseError')
  })

  it('attaches the response so the caller can read status and headers', () => {
    const res = response({ headers: { 'retry-after': '30' } })
    const error = new HttpResponseError(res)
    expect(error.response).toBe(res)
    expect(error.response.headers['retry-after']).toBe('30')
  })

  it('builds a message from the status and its text', () => {
    expect(new HttpResponseError(response()).message).toBe(
      'HTTP 503: Service Unavailable',
    )
  })

  it('prefers a caller-supplied message', () => {
    expect(
      new HttpResponseError(response(), 'upstream is draining').message,
    ).toBe('upstream is draining')
  })

  it('says so when the response carries no status text', () => {
    expect(new HttpResponseError(response({ statusText: '' })).message).toBe(
      'HTTP 503: No status message',
    )
  })

  it('says so when the response carries no status at all', () => {
    // A transport that failed before a status line leaves it unset, and the
    // message has to stay readable rather than printing undefined.
    const res = response()
    Reflect.deleteProperty(res, 'status')
    expect(new HttpResponseError(res).message).toBe(
      'HTTP unknown: Service Unavailable',
    )
  })
})
