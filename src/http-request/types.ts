/**
 * @fileoverview Public type surface for `http-request/*` modules —
 * interfaces, type aliases, and the `HttpResponseError` class. Pure
 * types and a single named-error class only; no I/O or runtime side
 * effects so this module stays cheap to import everywhere.
 */

import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { Readable } from 'node:stream'
import type { Logger } from '../logger/core'

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
  headers?: IncomingHttpHeaders | undefined
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
   *
   * @example
   * ```ts
   * // Allow up to 10 redirects
   * await httpRequest('https://example.com/many-redirects', {
   *   maxRedirects: 10
   * })
   * ```
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
   * // GET request (default)
   * await httpRequest('https://api.example.com/data')
   *
   * // POST request
   * await httpRequest('https://api.example.com/data', {
   *   method: 'POST',
   *   body: JSON.stringify({ name: 'Alice' })
   * })
   *
   * // DELETE request
   * await httpRequest('https://api.example.com/data/123', {
   *   method: 'DELETE'
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
   *
   * @example
   * ```ts
   * await httpRequest('https://api.example.com/data', {
   *   retries: 3,
   *   throwOnError: true,
   *   onRetry: (attempt, error, delay) => {
   *     // Don't retry client errors (except 429)
   *     if (error instanceof HttpResponseError) {
   *       if (error.response.status === 429) {
   *         const retryAfter = parseRetryAfterHeader(error.response.headers['retry-after'])
   *         return retryAfter ?? undefined
   *       }
   *       if (error.response.status >= 400 && error.response.status < 500) {
   *         return false
   *       }
   *     }
   *   }
   * })
   * ```
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
   *
   * @example
   * ```ts
   * // Retry up to 3 times with exponential backoff
   * await httpRequest('https://api.example.com/data', {
   *   retries: 3,
   *   retryDelay: 1000 // 1s, then 2s, then 4s
   * })
   * ```
   */
  retries?: number | undefined
  /**
   * Initial delay in milliseconds before first retry.
   * Subsequent retries use exponential backoff.
   *
   * @default 1000
   *
   * @example
   * ```ts
   * // Start with 2 second delay, then 4s, 8s, etc.
   * await httpRequest('https://api.example.com/data', {
   *   retries: 3,
   *   retryDelay: 2000
   * })
   * ```
   */
  retryDelay?: number | undefined
  /**
   * When true, non-2xx HTTP responses throw an `HttpResponseError` instead
   * of resolving with `response.ok === false`. This makes HTTP error
   * responses eligible for retry via the `retries` option.
   *
   * @default false
   *
   * @example
   * ```ts
   * // Throw on 4xx/5xx responses (enabling retry for 5xx)
   * await httpRequest('https://api.example.com/data', {
   *   throwOnError: true,
   *   retries: 3
   * })
   * ```
   */
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
  throwOnError?: boolean | undefined
  /**
   * Request timeout in milliseconds.
   * If the request takes longer than this, it will be aborted.
   *
   * @default 30000
   *
   * @example
   * ```ts
   * // 60 second timeout
   * await httpRequest('https://api.example.com/slow-endpoint', {
   *   timeout: 60000
   * })
   * ```
   */
  timeout?: number | undefined
}

/**
 * HTTP response object with fetch-like interface.
 * Provides multiple ways to access the response body.
 */
export interface HttpResponse {
  /**
   * Get response body as ArrayBuffer.
   * Useful for binary data or when you need compatibility with browser APIs.
   *
   * @returns The response body as an ArrayBuffer
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com/image.png')
   * const arrayBuffer = response.arrayBuffer()
   * console.log(arrayBuffer.byteLength)
   * ```
   */
  arrayBuffer(): ArrayBuffer
  /**
   * Raw response body as Buffer.
   * Direct access to the underlying Node.js Buffer.
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com/data')
   * console.log(response.body.length) // Size in bytes
   * console.log(response.body.toString('hex')) // View as hex
   * ```
   */
  body: Buffer
  /**
   * HTTP response headers.
   * Keys are lowercase header names, values can be strings or string arrays.
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com')
   * console.log(response.headers['content-type'])
   * console.log(response.headers['set-cookie']) // May be string[]
   * ```
   */
  headers: IncomingHttpHeaders
  /**
   * Parse response body as JSON.
   * Type parameter `T` allows specifying the expected JSON structure.
   *
   * @template T - Expected JSON type (defaults to `unknown`)
   * @returns Parsed JSON data
   * @throws {SyntaxError} When response body is not valid JSON
   *
   * @example
   * ```ts
   * interface User { name: string; id: number }
   * const response = await httpRequest('https://api.example.com/user')
   * const user = response.json<User>()
   * console.log(user.name, user.id)
   * ```
   */
  json<T = unknown>(): T
  /**
   * Whether the request was successful (status code 200-299).
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com/data')
   * if (response.ok) {
   *   console.log('Success:', response.json())
   * } else {
   *   console.error('Failed:', response.status, response.statusText)
   * }
   * ```
   */
  ok: boolean
  /**
   * HTTP status code (e.g., 200, 404, 500).
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com')
   * console.log(response.status) // 200, 404, etc.
   * ```
   */
  status: number
  /**
   * HTTP status message (e.g., "OK", "Not Found", "Internal Server Error").
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com')
   * console.log(response.statusText) // "OK"
   * ```
   */
  statusText: string
  /**
   * Get response body as UTF-8 text string.
   *
   * @returns The response body as a string
   *
   * @example
   * ```ts
   * const response = await httpRequest('https://example.com')
   * const html = response.text()
   * console.log(html.includes('<html>'))
   * ```
   */
  text(): string
  /**
   * The underlying Node.js IncomingResponse for advanced use cases
   * (e.g., streaming, custom header inspection). Only available when
   * the response was not consumed by the convenience methods.
   */
  rawResponse?: IncomingResponse | undefined
}

/**
 * Error thrown when an HTTP response has a non-2xx status code
 * and `throwOnError` is enabled. Carries the full `HttpResponse`
 * so callers can inspect status, headers, and body.
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

/**
 * Configuration options for file downloads.
 */
export interface HttpDownloadOptions {
  /**
   * Custom CA certificates for TLS connections.
   * When provided, these certificates are used for the download request.
   * See `HttpRequestOptions.ca` for details.
   */
  ca?: string[] | undefined
  /**
   * Whether to automatically follow HTTP redirects (3xx status codes).
   * This is essential for downloading from services that use CDN redirects,
   * such as GitHub release assets which return HTTP 302 to their CDN.
   *
   * @default true
   *
   * @example
   * ```ts
   * // Follow redirects (default) - works with GitHub releases
   * await httpDownload(
   *   'https://github.com/org/repo/releases/download/v1.0.0/file.zip',
   *   '/tmp/file.zip'
   * )
   *
   * // Don't follow redirects
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   followRedirects: false
   * })
   * ```
   */
  followRedirects?: boolean | undefined
  /**
   * HTTP headers to send with the download request.
   * A `User-Agent` header is automatically added if not provided.
   *
   * @example
   * ```ts
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   headers: {
   *     'Authorization': 'Bearer token123'
   *   }
   * })
   * ```
   */
  headers?: Record<string, string> | undefined
  /**
   * Logger instance for automatic progress logging.
   * When provided with `progressInterval`, will automatically log download progress.
   * If both `onProgress` and `logger` are provided, `onProgress` takes precedence.
   *
   * @example
   * ```ts
   * import { getDefaultLogger } from '@socketsecurity/lib/logger/default'
   *
   * const logger = getDefaultLogger()
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   logger,
   *   progressInterval: 10  // Log every 10%
   * })
   * // Output:
   * //   Progress: 10% (5.2 MB / 52.0 MB)
   * //   Progress: 20% (10.4 MB / 52.0 MB)
   * //   ...
   * ```
   */
  logger?: Logger | undefined
  /**
   * Maximum number of redirects to follow before throwing an error.
   * Only relevant when `followRedirects` is `true`.
   *
   * @default 5
   *
   * @example
   * ```ts
   * // Allow up to 10 redirects
   * await httpDownload('https://example.com/many-redirects/file.zip', '/tmp/file.zip', {
   *   maxRedirects: 10
   * })
   * ```
   */
  maxRedirects?: number | undefined
  /**
   * Callback for tracking download progress.
   * Called periodically as data is received.
   * Takes precedence over `logger` if both are provided.
   *
   * @param downloaded - Number of bytes downloaded so far
   * @param total - Total file size in bytes (from Content-Length header)
   *
   * @example
   * ```ts
   * await httpDownload('https://example.com/large-file.zip', '/tmp/file.zip', {
   *   onProgress: (downloaded, total) => {
   *     const percent = ((downloaded / total) * 100).toFixed(1)
   *     console.log(`Progress: ${percent}%`)
   *   }
   * })
   * ```
   */
  onProgress?: ((downloaded: number, total: number) => void) | undefined
  /**
   * Progress reporting interval as a percentage (0-100).
   * Only used when `logger` is provided.
   * Progress will be logged each time the download advances by this percentage.
   *
   * @default 10
   *
   * @example
   * ```ts
   * // Log every 10%
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   logger: getDefaultLogger(),
   *   progressInterval: 10
   * })
   *
   * // Log every 25%
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   logger: getDefaultLogger(),
   *   progressInterval: 25
   * })
   * ```
   */
  progressInterval?: number | undefined
  /**
   * Number of retry attempts for failed downloads.
   * Uses exponential backoff: delay = `retryDelay` * 2^attempt.
   *
   * @default 0
   *
   * @example
   * ```ts
   * // Retry up to 3 times for unreliable connections
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   retries: 3,
   *   retryDelay: 2000
   * })
   * ```
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
   * Download timeout in milliseconds.
   * If the download takes longer than this, it will be aborted.
   *
   * @default 120000
   *
   * @example
   * ```ts
   * // 5 minute timeout for large files
   * await httpDownload('https://example.com/huge-file.zip', '/tmp/file.zip', {
   *   timeout: 300000
   * })
   * ```
   */
  timeout?: number | undefined
  /**
   * Expected SHA256 hash of the downloaded file.
   * If provided, the download will fail if the computed hash doesn't match.
   * The hash should be a lowercase hex string (64 characters).
   *
   * Use `fetchChecksums()` to fetch hashes from a checksums URL, then pass
   * the specific hash here.
   *
   * @example
   * ```ts
   * // Verify download integrity with direct hash
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
   * })
   *
   * // Verify using checksums from a URL
   * const checksums = await fetchChecksums('https://example.com/checksums.txt')
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   sha256: checksums['file.zip']
   * })
   * ```
   */
  sha256?: string | undefined
}

/**
 * Result of a successful file download.
 */
export interface HttpDownloadResult {
  /** HTTP response headers from the final response (after redirects). */
  headers: IncomingHttpHeaders
  /** Whether the download succeeded (status 200-299). Always true on success (non-2xx throws). */
  ok: true
  /** Absolute path where the file was saved. */
  path: string
  /** Total size of downloaded file in bytes. */
  size: number
  /** HTTP status code from the final response (after redirects). */
  status: number
  /** HTTP status message from the final response (after redirects). */
  statusText: string
}

/**
 * Map of filenames to their SHA256 hashes.
 * Keys are filenames (not paths), values are lowercase hex-encoded SHA256 hashes.
 *
 * @example
 * ```ts
 * const checksums: Checksums = {
 *   'file.zip': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
 *   'other.tar.gz': 'abc123...'
 * }
 * ```
 */
export type Checksums = Record<string, string>

/**
 * Options for fetching checksums from a URL.
 */
export interface FetchChecksumsOptions {
  /**
   * Custom CA certificates for TLS connections.
   * See `HttpRequestOptions.ca` for details.
   */
  ca?: string[] | undefined
  /**
   * HTTP headers to send with the request.
   */
  headers?: Record<string, string> | undefined
  /**
   * Request timeout in milliseconds.
   * @default 30000
   */
  timeout?: number | undefined
}
