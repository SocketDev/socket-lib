/**
 * @fileoverview Types for HTTP request configuration — options, hooks,
 * and Node `IncomingMessage` aliases. Split out of `http-request/types.ts`
 * for size hygiene.
 *
 *   - `IncomingResponse` / `IncomingRequest` — Node IncomingMessage aliases
 *   - `HttpHookRequestInfo` / `HttpHookResponseInfo` / `HttpHooks` — observability
 *   - `HttpRequestOptions` — the main request configuration interface
 */

import type { IncomingMessage } from 'node:http'
import type { Readable } from 'node:stream'

/** IncomingMessage received as a response to a client request (http.request callback). */
export type IncomingResponse = IncomingMessage

/** IncomingMessage received as a request in a server handler (http.createServer callback). */
export type IncomingRequest = IncomingMessage

/**
 * Information passed to the onRequest hook before each request attempt.
 */
export interface HttpHookRequestInfo {
  headers: Record<string, string>
  method: string
  timeout: number
  url: string
}

/**
 * Information passed to the onResponse hook after each request attempt.
 */
export interface HttpHookResponseInfo {
  duration: number
  error?: Error | undefined
  headers?: import('node:http').IncomingHttpHeaders | undefined
  method: string
  status?: number | undefined
  statusText?: string | undefined
  url: string
}

/**
 * Lifecycle hooks for observing HTTP request/response events.
 * Hooks fire per-attempt (retries produce multiple hook calls).
 */
export interface HttpHooks {
  onRequest?: ((info: HttpHookRequestInfo) => void) | undefined
  onResponse?: ((info: HttpHookResponseInfo) => void) | undefined
}

/**
 * Configuration options for HTTP/HTTPS requests.
 */
export interface HttpRequestOptions {
  /**
   * Request body to send.
   * Can be a string, Buffer, or Readable stream.
   *
   * When a Readable stream is provided, it is piped directly to the request.
   * If the stream has a `getHeaders()` method (duck-typed, e.g., the `form-data`
   * npm package), its headers (Content-Type with boundary) are automatically
   * merged into the request headers.
   *
   * **Note:** Streaming bodies are one-shot — they cannot be replayed. Using a
   * Readable body with `retries > 0` throws an error. Buffer the body as a
   * string/Buffer if retries are needed. Redirects are also disabled for
   * streaming bodies since the stream is consumed on the first request.
   *
   * @example
   * ```ts
   * // Send JSON data
   * await httpRequest('https://api.example.com/data', {
   *   method: 'POST',
   *   body: JSON.stringify({ name: 'Alice' }),
   *   headers: { 'Content-Type': 'application/json' }
   * })
   *
   * // Send binary data
   * const buffer = Buffer.from([0x00, 0x01, 0x02])
   * await httpRequest('https://api.example.com/upload', {
   *   method: 'POST',
   *   body: buffer
   * })
   *
   * // Stream form-data (npm package, not native FormData)
   * import FormData from 'form-data'
   * const form = new FormData()
   * form.append('file', createReadStream('data.json'))
   * await httpRequest('https://api.example.com/upload', {
   *   method: 'POST',
   *   body: form  // auto-merges form.getHeaders()
   * })
   * ```
   */
  body?: Buffer | Readable | string | undefined
  /**
   * Custom CA certificates for TLS connections.
   * When provided, these certificates are combined with the default trust
   * store via an HTTPS agent. Useful when SSL_CERT_FILE is set but
   * NODE_EXTRA_CA_CERTS was not available at process startup.
   *
   * @example
   * ```ts
   * import { rootCertificates } from 'node:tls'
   * import { readFileSync } from 'node:fs'
   *
   * const extraCerts = readFileSync('/path/to/cert.pem', 'utf-8')
   * await httpRequest('https://api.example.com', {
   *   ca: [...rootCertificates, extraCerts]
   * })
   * ```
   */
  ca?: string[] | undefined
  /**
   * Whether to automatically follow HTTP redirects (3xx status codes).
   *
   * @default true
   *
   * @example
   * ```ts
   * // Follow redirects (default)
   * await httpRequest('https://example.com/redirect')
   *
   * // Don't follow redirects
   * const response = await httpRequest('https://example.com/redirect', {
   *   followRedirects: false
   * })
   * console.log(response.status) // 301 or 302
   * ```
   */
  followRedirects?: boolean | undefined
  /**
   * Lifecycle hooks for observing request/response events.
   * Hooks fire per-attempt — retries and redirects each trigger separate hook calls.
   */
  hooks?: HttpHooks | undefined
  /**
   * HTTP headers to send with the request.
   * A `User-Agent` header is automatically added if not provided.
   *
   * @example
   * ```ts
   * await httpRequest('https://api.example.com/data', {
   *   headers: {
   *     'Authorization': 'Bearer token123',
   *     'Content-Type': 'application/json',
   *     'Accept': 'application/json'
   *   }
   * })
   * ```
   */
  headers?: Record<string, string> | undefined
  /**
   * Maximum number of redirects to follow before throwing an error.
   * Only relevant when `followRedirects` is `true`.
   *
   * @default 5
   */
  maxRedirects?: number | undefined
  /**
   * Maximum response body size in bytes. Responses exceeding this limit
   * will be rejected with an error. Prevents memory exhaustion from
   * unexpectedly large responses.
   *
   * @default undefined (no limit)
   */
  maxResponseSize?: number | undefined
  /**
   * HTTP method to use for the request.
   *
   * @default 'GET'
   *
   * @example
   * ```ts
   * await httpRequest('https://api.example.com/data', {
   *   method: 'POST',
   *   body: JSON.stringify({ name: 'Alice' })
   * })
   * ```
   */
  method?: string | undefined
  /**
   * Callback invoked before each retry attempt.
   * Allows customizing retry behavior per-attempt (e.g., skip 4xx, honor Retry-After).
   *
   * @param attempt - Current retry attempt number (1-based)
   * @param error - The error that triggered the retry (HttpResponseError for HTTP errors)
   * @param delay - The calculated delay in ms before next retry
   * @returns `false` to stop retrying and rethrow,
   *          a `number` to override the delay (ms),
   *          or `undefined` to use the calculated delay
   */
  onRetry?:
    | ((
        attempt: number,
        error: unknown,
        delay: number,
      ) => boolean | number | undefined)
    | undefined
  /**
   * Number of retry attempts for failed requests.
   * Uses exponential backoff: delay = `retryDelay` * 2^attempt.
   *
   * @default 0
   */
  retries?: number | undefined
  /**
   * Initial delay in milliseconds before first retry.
   * Subsequent retries use exponential backoff.
   *
   * @default 1000
   */
  retryDelay?: number | undefined
  /**
   * When true, resolve with an HttpResponse whose body is NOT buffered.
   * The `rawResponse` property contains the unconsumed IncomingResponse
   * stream for piping to files or other destinations.
   *
   * `body`, `text()`, `json()`, and `arrayBuffer()` return empty/zero
   * values since the stream has not been read.
   *
   * Incompatible with `maxResponseSize` (size enforcement requires
   * reading the body).
   *
   * @default false
   */
  stream?: boolean | undefined
  /**
   * When true, non-2xx HTTP responses throw an `HttpResponseError` instead
   * of resolving with `response.ok === false`. This makes HTTP error
   * responses eligible for retry via the `retries` option.
   *
   * @default false
   */
  throwOnError?: boolean | undefined
  /**
   * Request timeout in milliseconds.
   * If the request takes longer than this, it will be aborted.
   *
   * @default 30000
   */
  timeout?: number | undefined
}
