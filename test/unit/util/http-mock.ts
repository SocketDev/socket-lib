/**
 * @file Shared HTTP-response mock helper for tests that mock
 *   `@socketsecurity/lib/http-request/*`.
 */

import type { HttpResponse } from '../../../src/http-request/response-types'

/**
 * Create a mock HttpResponse object for testing.
 *
 * @param body - Response body as Buffer.
 * @param ok - Whether the request was successful.
 * @param status - HTTP status code.
 *
 * @returns Complete mock HttpResponse object
 */
// Matches HttpResponse.ok shape; changing to options object would require
// updating many test call sites in sibling files. Kept as-is for test cohesion.
// oxlint-disable-next-line socket/no-boolean-trap-param -- test fixture match
export function createMockHttpResponse(
  body: Buffer,
  ok: boolean,
  status: number,
): HttpResponse {
  return {
    arrayBuffer: () => {
      const slice = body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      )
      return slice as ArrayBuffer
    },
    body,
    headers: {},
    json<T = unknown>(): T {
      return JSON.parse(body.toString('utf8')) as T
    },
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    text: () => body.toString('utf8'),
  }
}
