/**
 * @file Read a raw Node `IncomingMessage` into our `HttpResponse` shape. Split
 *   out of `http-request/request.ts` for size hygiene. Useful when a caller
 *   already has an `IncomingMessage` from code that bypasses `httpRequest()`
 *   (e.g., multipart uploads via `http.request()` directly, or third-party HTTP
 *   libraries) and wants the same fetch-like body accessors.
 */

import { BufferConcat } from '../primordials/buffer'
import { JSONParse } from '../primordials/json'

import type { IncomingResponse } from './request-types'
import type { HttpResponse } from './response-types'

/**
 * Read and buffer a client-side IncomingResponse into an HttpResponse.
 *
 * Useful when you have a raw response from code that bypasses `httpRequest()`
 * (e.g., multipart form-data uploads via `http.request()`, or responses from
 * third-party HTTP libraries) and need to convert it into the standard
 * HttpResponse interface.
 *
 * @example
 *   ;```typescript
 *   const raw = await makeRawRequest('https://example.com/api')
 *   const response = await readIncomingResponse(raw)
 *   console.log(response.status, response.body.toString('utf8'))
 *   ```
 */
export async function readIncomingResponse(
  msg: IncomingResponse,
): Promise<HttpResponse> {
  const chunks: Buffer[] = []
  for await (const chunk of msg) {
    chunks.push(chunk as Buffer)
  }
  const body = BufferConcat!(chunks)
  const status = msg.statusCode ?? 0
  const statusText = msg.statusMessage ?? ''
  return {
    arrayBuffer: () =>
      body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer,
    body,
    headers: msg.headers,
    json: <T = unknown>() => JSONParse(body.toString('utf8')) as T,
    ok: status >= 200 && status < 300,
    rawResponse: msg,
    status,
    statusText,
    text: () => body.toString('utf8'),
  }
}
