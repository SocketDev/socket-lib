/**
 * @file Types for HTTP response surface — `HttpResponse` with its fetch-like
 *   body accessors, and `HttpResponseError` for `throwOnError`. Split out of
 *   `http-request/types.ts` for size hygiene.
 */

import type { IncomingHttpHeaders } from 'node:http'

import type { IncomingResponse } from './request-types'

/**
 * HTTP response object with fetch-like interface. Provides multiple ways to
 * access the response body.
 */
export interface HttpResponse {
  /**
   * Get response body as ArrayBuffer. Useful for binary data or when you need
   * compatibility with browser APIs.
   *
   * @example
   *   ;```ts
   *   const response = await httpRequest('https://example.com/image.png')
   *   const arrayBuffer = response.arrayBuffer()
   *   console.log(arrayBuffer.byteLength)
   *   ```
   *
   * @returns The response body as an ArrayBuffer
   */
  arrayBuffer(): ArrayBuffer
  /**
   * Raw response body as Buffer. Direct access to the underlying Node.js
   * Buffer.
   *
   * @example
   *   ;```ts
   *   const response = await httpRequest('https://example.com/data')
   *   console.log(response.body.length) // Size in bytes
   *   console.log(response.body.toString('hex')) // View as hex
   *   ```
   */
  body: Buffer
  /**
   * HTTP response headers. Keys are lowercase header names, values can be
   * strings or string arrays.
   *
   * @example
   *   ;```ts
   *   const response = await httpRequest('https://example.com')
   *   console.log(response.headers['content-type'])
   *   console.log(response.headers['set-cookie']) // May be string[]
   *   ```
   */
  headers: IncomingHttpHeaders
  /**
   * Parse response body as JSON. Type parameter `T` allows specifying the
   * expected JSON structure.
   *
   * @example
   *   ;```ts
   *   interface User {
   *     name: string
   *     id: number
   *   }
   *   const response = await httpRequest('https://api.example.com/user')
   *   const user = response.json<User>()
   *   console.log(user.name, user.id)
   *   ```
   *
   * @template T - Expected JSON type (defaults to `unknown`)
   *
   * @returns Parsed JSON data
   *
   * @throws {SyntaxError} When response body is not valid JSON
   */
  json<T = unknown>(): T
  /**
   * Whether the request was successful (status code 200-299).
   *
   * @example
   *   ;```ts
   *   const response = await httpRequest('https://example.com/data')
   *   if (response.ok) {
   *     console.log('Success:', response.json())
   *   } else {
   *     console.error('Failed:', response.status, response.statusText)
   *   }
   *   ```
   */
  ok: boolean
  /**
   * HTTP status code (e.g., 200, 404, 500).
   */
  status: number
  /**
   * HTTP status message (e.g., "OK", "Not Found", "Internal Server Error").
   */
  statusText: string
  /**
   * Get response body as UTF-8 text string.
   *
   * @example
   *   ;```ts
   *   const response = await httpRequest('https://example.com')
   *   const html = response.text()
   *   console.log(html.includes('<html>'))
   *   ```
   *
   * @returns The response body as a string
   */
  text(): string
  /**
   * The underlying Node.js IncomingResponse for advanced use cases (e.g.,
   * streaming, custom header inspection). Only available when the response was
   * not consumed by the convenience methods.
   */
  rawResponse?: IncomingResponse | undefined
}

/**
 * Error thrown when an HTTP response has a non-2xx status code and
 * `throwOnError` is enabled. Carries the full `HttpResponse` so callers can
 * inspect status, headers, and body.
 */
export class HttpResponseError extends Error {
  response: HttpResponse

  constructor(response: HttpResponse, message?: string | undefined) {
    const statusCode = response.status ?? 'unknown'
    const statusMessage = response.statusText || 'No status message'
    super(message ?? `HTTP ${statusCode}: ${statusMessage}`)
    this.name = 'HttpResponseError'
    this.response = response
    Error.captureStackTrace(this, HttpResponseError)
  }
}
