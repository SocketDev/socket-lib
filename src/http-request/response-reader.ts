/**
 * @file Read a raw Node `IncomingMessage` into our `HttpResponse` shape. Split
 *   out of `http-request/request.ts` for size hygiene. Useful when a caller
 *   already has an `IncomingMessage` from code that bypasses `httpRequest()`
 *   (e.g., multipart uploads via `http.request()` directly, or third-party HTTP
 *   libraries) and wants the same fetch-like body accessors. The body is
 *   transparently decompressed when the response carries a `Content-Encoding`
 *   of `gzip` or `br` — the two encodings `httpRequest` advertises via
 *   `Accept-Encoding`. Node's http client does not decompress on its own, so
 *   without this step a compressed Socket API response would reach callers as
 *   raw deflated bytes and fail JSON parsing.
 */

import { decompressBrotli } from '../compression/brotli'
import { decompressGzip } from '../compression/gzip'
import { BufferConcat } from '../primordials/buffer'
import { JSONParse } from '../primordials/json'

import type { IncomingResponse } from './request-types'
import type { HttpResponse } from './response-types'

/**
 * Decompress a response body per its `Content-Encoding`. Returns the input
 * unchanged for `identity` or any unrecognized/absent encoding — we only
 * decompress what `httpRequest` advertised support for (`gzip`, `br`).
 */
export async function decodeBody(
  body: Buffer,
  contentEncoding: string | string[] | undefined,
): Promise<Buffer> {
  if (!contentEncoding || body.length === 0) {
    return body
  }
  // A comma-separated list applies encodings in order; the last applied is the
  // first to undo. In practice servers send a single token — handle the common
  // case and bail (return as-is) on anything layered or unrecognized.
  const encoding = (
    Array.isArray(contentEncoding) ? contentEncoding[0]! : contentEncoding
  )
    .trim()
    .toLowerCase()
  if (encoding === 'gzip') {
    return await decompressGzip(body)
  }
  if (encoding === 'br') {
    return await decompressBrotli(body)
  }
  return body
}

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
  const body = await decodeBody(
    BufferConcat!(chunks),
    msg.headers['content-encoding'],
  )
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
