/**
 * @fileoverview HTTP/HTTPS request utilities using Node.js built-in modules with retry logic, redirects, and download support.
 *
 * This module provides a fetch-like API built on top of Node.js native `http` and `https` modules.
 * It supports automatic retries with exponential backoff, redirect following, streaming downloads,
 * and provides a familiar fetch-style response interface.
 *
 * Key Features:
 * - Automatic retries with exponential backoff for failed requests.
 * - Redirect following with configurable max redirects.
 * - Streaming downloads with progress callbacks.
 * - Fetch-like response interface (`.json()`, `.text()`, `.arrayBuffer()`).
 * - Timeout support for all operations.
 * - Zero dependencies on external HTTP libraries.
 */

import type { Readable } from 'node:stream'

import { SOCKET_LIB_USER_AGENT } from './constants/socket'
import { safeDelete } from './fs.js'

import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import type { Logger } from './logger.js'

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
   * import { getDefaultLogger } from '@socketsecurity/lib/logger'
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

let _fs: typeof import('node:fs') | undefined
let _crypto: typeof import('node:crypto') | undefined
let _http: typeof import('node:http') | undefined
let _https: typeof import('node:https') | undefined

/**
 * Lazily load the crypto module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getCrypto() {
  if (_crypto === undefined) {
    _crypto = /*@__PURE__*/ require('node:crypto')
  }
  return _crypto as typeof import('node:crypto')
}

/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load http and https modules to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getHttp() {
  if (_http === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _http = /*@__PURE__*/ require('node:http')
  }
  return _http as typeof import('node:http')
}

/*@__NO_SIDE_EFFECTS__*/
function getHttps() {
  if (_https === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _https = /*@__PURE__*/ require('node:https')
  }
  return _https as typeof import('node:https')
}

/**
 * Single download attempt using httpRequestAttempt with stream: true.
 * @private
 */
async function httpDownloadAttempt(
  url: string,
  destPath: string,
  options: HttpDownloadOptions,
): Promise<HttpDownloadResult> {
  const {
    ca,
    followRedirects = true,
    headers = {},
    maxRedirects = 5,
    onProgress,
    timeout = 120_000,
  } = { __proto__: null, ...options } as HttpDownloadOptions

  const response = await httpRequestAttempt(url, {
    ca,
    followRedirects,
    headers,
    maxRedirects,
    method: 'GET',
    stream: true,
    timeout,
  })

  if (!response.ok) {
    throw new Error(
      `Download failed: HTTP ${response.status} ${response.statusText}`,
    )
  }

  const res = response.rawResponse
  if (!res) {
    throw new Error('Stream response missing rawResponse')
  }

  const { createWriteStream } = getFs()
  const totalSize = Number.parseInt(
    (response.headers['content-length'] as string) || '0',
    10,
  )

  return await new Promise((resolve, reject) => {
    let downloadedSize = 0
    const fileStream = createWriteStream(destPath)

    fileStream.on('error', (error: Error) => {
      fileStream.close()
      reject(
        new Error(`Failed to write file: ${error.message}`, { cause: error }),
      )
    })

    res.on('data', (chunk: Buffer) => {
      downloadedSize += chunk.length
      if (onProgress && totalSize > 0) {
        onProgress(downloadedSize, totalSize)
      }
    })

    res.on('end', () => {
      fileStream.close(() => {
        resolve({
          headers: response.headers,
          ok: true,
          path: destPath,
          size: downloadedSize,
          status: response.status,
          statusText: response.statusText,
        })
      })
    })

    res.on('error', (error: Error) => {
      fileStream.close()
      reject(error)
    })

    res.pipe(fileStream)
  })
}

/**
 * Single HTTP request attempt (used internally by httpRequest with retry logic).
 * Supports hooks (fire per-attempt), maxResponseSize, and rawResponse.
 * @private
 */
async function httpRequestAttempt(
  url: string,
  options: HttpRequestOptions,
): Promise<HttpResponse> {
  const {
    body,
    ca,
    followRedirects = true,
    headers = {},
    hooks,
    maxRedirects = 5,
    maxResponseSize,
    method = 'GET',
    stream = false,
    timeout = 30_000,
  } = { __proto__: null, ...options } as HttpRequestOptions

  const startTime = Date.now()

  // Auto-merge FormData headers (Content-Type with boundary).
  const streamHeaders =
    body &&
    typeof body === 'object' &&
    'getHeaders' in body &&
    typeof (body as { getHeaders?: unknown }).getHeaders === 'function'
      ? (body as { getHeaders: () => Record<string, string> }).getHeaders()
      : undefined

  const mergedHeaders = {
    'User-Agent': SOCKET_LIB_USER_AGENT,
    ...streamHeaders,
    ...headers,
  }

  hooks?.onRequest?.({ method, url, headers: mergedHeaders, timeout })

  return await new Promise((resolve, reject) => {
    // Settled flag guards all resolve/reject paths so that at most one
    // fires, even when destroy() cascades multiple events.
    let settled = false
    const resolveOnce = (response: HttpResponse) => {
      if (settled) {
        return
      }
      settled = true
      resolve(response)
    }
    const rejectOnce = (err: Error) => {
      if (settled) {
        return
      }
      settled = true
      // Clean up streaming body if still active to avoid leaked descriptors.
      if (
        body &&
        typeof body === 'object' &&
        typeof (body as { destroy?: unknown }).destroy === 'function'
      ) {
        ;(body as { destroy: () => void }).destroy()
      }
      emitResponse({ error: err })
      reject(err)
    }

    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const httpModule = isHttps ? getHttps() : getHttp()

    const requestOptions: Record<string, unknown> = {
      headers: mergedHeaders,
      hostname: parsedUrl.hostname,
      method,
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port,
      timeout,
    }

    if (ca && isHttps) {
      requestOptions['ca'] = ca
    }

    const emitResponse = (info: Partial<HttpHookResponseInfo>) => {
      try {
        hooks?.onResponse?.({
          duration: Date.now() - startTime,
          method,
          url,
          ...info,
        })
      } catch {
        // User-provided hook threw — swallow to avoid leaving the promise pending.
      }
    }

    /* c8 ignore start - External HTTP/HTTPS request */
    const request = httpModule.request(
      requestOptions,
      (res: IncomingResponse) => {
        if (
          followRedirects &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          // Drain the redirect response body to free the socket.
          res.resume()

          emitResponse({
            headers: res.headers,
            status: res.statusCode,
            statusText: res.statusMessage,
          })

          if (maxRedirects <= 0) {
            // Hook already emitted above — reject directly to avoid double-fire.
            settled = true
            reject(
              new Error(
                `Too many redirects (exceeded maximum: ${maxRedirects})`,
              ),
            )
            return
          }

          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString()

          const redirectParsed = new URL(redirectUrl)
          if (isHttps && redirectParsed.protocol !== 'https:') {
            // Hook already emitted above — reject directly to avoid double-fire.
            settled = true
            reject(
              new Error(
                `Redirect from HTTPS to HTTP is not allowed: ${redirectUrl}`,
              ),
            )
            return
          }

          // Redirect chaining — Promise adoption handles the inner result.
          settled = true
          resolve(
            httpRequestAttempt(redirectUrl, {
              body,
              ca,
              followRedirects,
              headers,
              hooks,
              maxRedirects: maxRedirects - 1,
              maxResponseSize,
              method,
              stream,
              timeout,
            }),
          )
          return
        }

        // Stream mode: resolve immediately with unconsumed response.
        if (stream) {
          const status = res.statusCode || 0
          const statusText = res.statusMessage || ''
          const ok = status >= 200 && status < 300

          emitResponse({
            headers: res.headers,
            status,
            statusText,
          })

          const emptyBody = Buffer.alloc(0)
          resolveOnce({
            arrayBuffer: () => emptyBody.buffer as ArrayBuffer,
            body: emptyBody,
            headers: res.headers,
            json: () => {
              throw new Error('Cannot parse JSON from a streaming response')
            },
            ok,
            rawResponse: res,
            status,
            statusText,
            text: () => '',
          })
          return
        }

        const chunks: Buffer[] = []
        let totalBytes = 0

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length
          if (maxResponseSize && totalBytes > maxResponseSize) {
            res.destroy()
            request.destroy()
            const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2)
            const maxMB = (maxResponseSize / (1024 * 1024)).toFixed(2)
            rejectOnce(
              new Error(
                `Response exceeds maximum size limit (${sizeMB}MB > ${maxMB}MB)`,
              ),
            )
            return
          }
          chunks.push(chunk)
        })

        res.on('end', () => {
          if (settled) {
            return
          }

          const responseBody = Buffer.concat(chunks)
          const ok =
            res.statusCode !== undefined &&
            res.statusCode >= 200 &&
            res.statusCode < 300

          const response: HttpResponse = {
            arrayBuffer(): ArrayBuffer {
              return responseBody.buffer.slice(
                responseBody.byteOffset,
                responseBody.byteOffset + responseBody.byteLength,
              )
            },
            body: responseBody,
            headers: res.headers,
            json<T = unknown>(): T {
              return JSON.parse(responseBody.toString('utf8')) as T
            },
            ok,
            rawResponse: res,
            status: res.statusCode || 0,
            statusText: res.statusMessage || '',
            text(): string {
              return responseBody.toString('utf8')
            },
          }

          emitResponse({
            headers: res.headers,
            status: res.statusCode,
            statusText: res.statusMessage,
          })

          resolveOnce(response)
        })

        res.on('error', (error: Error) => {
          rejectOnce(error)
        })
      },
    )

    request.on('error', (error: Error) => {
      const message = enrichErrorMessage(
        url,
        method,
        error as NodeJS.ErrnoException,
      )
      rejectOnce(new Error(message, { cause: error }))
    })

    request.on('timeout', () => {
      request.destroy()
      rejectOnce(
        new Error(
          `${method} request timed out after ${timeout}ms: ${url}\n→ Server did not respond in time.\n→ Try: Increase timeout or check network connectivity.`,
        ),
      )
    })

    if (body) {
      // Duck-type: streams have a `pipe` method.
      if (
        typeof body === 'object' &&
        typeof (body as { pipe?: unknown }).pipe === 'function'
      ) {
        // Readable stream (including FormData) — pipe it.
        // The error listener is cleaned up implicitly: on failure rejectOnce
        // destroys the stream, and on success the stream is fully consumed.
        // Both cases prevent further error events.
        const stream = body as import('node:stream').Readable
        stream.on('error', (err: Error) => {
          request.destroy()
          rejectOnce(err)
        })
        stream.pipe(request)
        return
      }
      // String or Buffer.
      request.write(body)
      request.end()
    } else {
      request.end()
    }
    /* c8 ignore stop */
  })
}

/**
 * Build an enriched error message based on the error code.
 * Generic guidance (no product-specific branding).
 *
 * @example
 * ```typescript
 * try {
 *   await fetch('https://api.example.com')
 * } catch (err) {
 *   console.error(enrichErrorMessage('https://api.example.com', 'GET', err))
 * }
 * ```
 */
export function enrichErrorMessage(
  url: string,
  method: string,
  error: NodeJS.ErrnoException,
): string {
  const code = error.code
  let message = `${method} request failed: ${url}`
  if (code === 'ECONNREFUSED') {
    message +=
      '\n→ Connection refused. Server is unreachable.\n→ Check: Network connectivity and firewall settings.'
  } else if (code === 'ENOTFOUND') {
    message +=
      '\n→ DNS lookup failed. Cannot resolve hostname.\n→ Check: Internet connection and DNS settings.'
  } else if (code === 'ETIMEDOUT') {
    message +=
      '\n→ Connection timed out. Network or server issue.\n→ Try: Check network connectivity and retry.'
  } else if (code === 'ECONNRESET') {
    message +=
      '\n→ Connection reset by server. Possible network interruption.\n→ Try: Retry the request.'
  } else if (code === 'EPIPE') {
    message +=
      '\n→ Broken pipe. Server closed connection unexpectedly.\n→ Check: Authentication credentials and permissions.'
  } else if (
    code === 'CERT_HAS_EXPIRED' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    message +=
      '\n→ SSL/TLS certificate error.\n→ Check: System time and date are correct.\n→ Try: Update CA certificates on your system.'
  } else if (code) {
    message += `\n→ Error code: ${code}`
  }
  return message
}

/**
 * Fetch and parse a checksums file from a URL.
 *
 * This is useful for verifying downloads from GitHub releases which typically
 * publish a checksums.txt file alongside release assets.
 *
 * @param url - URL to the checksums file
 * @param options - Request options
 * @returns Map of filenames to lowercase SHA256 hashes
 * @throws {Error} When the checksums file cannot be fetched
 *
 * @example
 * ```ts
 * // Fetch checksums from GitHub release
 * const checksums = await fetchChecksums(
 *   'https://github.com/org/repo/releases/download/v1.0.0/checksums.txt'
 * )
 *
 * // Use with httpDownload
 * await httpDownload(
 *   'https://github.com/org/repo/releases/download/v1.0.0/tool_linux.tar.gz',
 *   '/tmp/tool.tar.gz',
 *   { sha256: checksums['tool_linux.tar.gz'] }
 * )
 * ```
 */
export async function fetchChecksums(
  url: string,
  options?: FetchChecksumsOptions | undefined,
): Promise<Checksums> {
  const {
    ca,
    headers = {},
    timeout = 30_000,
  } = {
    __proto__: null,
    ...options,
  } as FetchChecksumsOptions

  const response = await httpRequest(url, { ca, headers, timeout })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch checksums from ${url}: ${response.status} ${response.statusText}`,
    )
  }

  return parseChecksums(response.body.toString('utf8'))
}

/**
 * Download a file from a URL to a local path with redirect support, retry logic, and progress callbacks.
 * Uses streaming to avoid loading entire file in memory.
 *
 * The download is streamed directly to disk, making it memory-efficient even for
 * large files. Progress callbacks allow for real-time download status updates.
 *
 * Automatically follows HTTP redirects (3xx status codes) by default, making it suitable
 * for downloading from services like GitHub releases that redirect to CDN URLs.
 *
 * @param url - The URL to download from (must start with http:// or https://)
 * @param destPath - Absolute path where the file should be saved
 * @param options - Download configuration options
 * @returns Promise resolving to download result with path and size
 * @throws {Error} When all retries are exhausted, download fails, or file cannot be written
 *
 * @example
 * ```ts
 * // Simple download
 * const result = await httpDownload(
 *   'https://example.com/file.zip',
 *   '/tmp/file.zip'
 * )
 * console.log(`Downloaded ${result.size} bytes to ${result.path}`)
 *
 * // Download from GitHub releases (handles 302 redirect automatically)
 * await httpDownload(
 *   'https://github.com/org/repo/releases/download/v1.0.0/binary.tar.gz',
 *   '/tmp/binary.tar.gz'
 * )
 *
 * // With progress tracking
 * await httpDownload(
 *   'https://example.com/large-file.zip',
 *   '/tmp/file.zip',
 *   {
 *     onProgress: (downloaded, total) => {
 *       const percent = ((downloaded / total) * 100).toFixed(1)
 *       console.log(`Progress: ${percent}% (${downloaded}/${total} bytes)`)
 *     }
 *   }
 * )
 *
 * // With retries and custom timeout
 * await httpDownload(
 *   'https://example.com/file.zip',
 *   '/tmp/file.zip',
 *   {
 *     retries: 3,
 *     retryDelay: 2000,
 *     timeout: 300000, // 5 minutes
 *     headers: { 'Authorization': 'Bearer token123' }
 *   }
 * )
 * ```
 */
export async function httpDownload(
  url: string,
  destPath: string,
  options?: HttpDownloadOptions | undefined,
): Promise<HttpDownloadResult> {
  const {
    ca,
    followRedirects = true,
    headers = {},
    logger,
    maxRedirects = 5,
    onProgress,
    progressInterval = 10,
    retries = 0,
    retryDelay = 1000,
    sha256,
    timeout = 120_000,
  } = { __proto__: null, ...options } as HttpDownloadOptions

  // Create progress callback - onProgress takes precedence over logger
  let progressCallback:
    | ((downloaded: number, total: number) => void)
    | undefined
  if (onProgress) {
    progressCallback = onProgress
  } else if (logger) {
    let lastPercent = 0
    progressCallback = (downloaded: number, total: number) => {
      const percent = total === 0 ? 0 : Math.floor((downloaded / total) * 100)
      if (percent >= lastPercent + progressInterval) {
        logger.log(
          `  Progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`,
        )
        lastPercent = percent
      }
    }
  }

  // Download to a temp file first, then atomically rename to destination.
  // This prevents partial/corrupted files at the destination path if download fails,
  // and preserves the original file (if any) until download succeeds.
  const crypto = getCrypto()
  const fs = getFs()
  const tempSuffix = crypto.randomBytes(6).toString('hex')
  const tempPath = `${destPath}.${tempSuffix}.download`

  // Clean up any stale temp file from a previous failed download.
  if (fs.existsSync(tempPath)) {
    await safeDelete(tempPath)
  }

  // Retry logic with exponential backoff
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await httpDownloadAttempt(url, tempPath, {
        ca,
        followRedirects,
        headers,
        maxRedirects,
        onProgress: progressCallback,
        timeout,
      })

      // Verify checksum if sha256 hash is provided.
      if (sha256) {
        // eslint-disable-next-line no-await-in-loop
        const fileContent = await fs.promises.readFile(tempPath)
        const computedHash = crypto
          .createHash('sha256')
          .update(fileContent)
          .digest('hex')

        const expectedHash = sha256.toLowerCase()

        // Use constant-time comparison to prevent timing attacks.
        if (
          computedHash.length !== expectedHash.length ||
          !crypto.timingSafeEqual(
            Buffer.from(computedHash),
            Buffer.from(expectedHash),
          )
        ) {
          // eslint-disable-next-line no-await-in-loop
          await safeDelete(tempPath)
          throw new Error(
            `Checksum verification failed for ${url}\n` +
              `Expected: ${expectedHash}\n` +
              `Computed: ${computedHash}`,
          )
        }
      }

      // Download succeeded - atomically rename temp file to destination.
      // This overwrites any existing file at destPath.
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.rename(tempPath, destPath)

      return {
        ...result,
        path: destPath,
      }
    } catch (e) {
      lastError = e as Error

      // Clean up failed temp file before retry.
      if (fs.existsSync(tempPath)) {
        // eslint-disable-next-line no-await-in-loop
        await safeDelete(tempPath)
      }

      // Last attempt - throw error
      if (attempt === retries) {
        break
      }

      // Retry with exponential backoff
      const delayMs = retryDelay * 2 ** attempt
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw lastError || new Error('Download failed after retries')
}

/**
 * Perform an HTTP request and parse JSON response.
 * Convenience wrapper around `httpRequest` for JSON API calls.
 * Automatically sets appropriate headers for JSON requests:
 * - `Accept: application/json` (always)
 * - `Content-Type: application/json` (when body is present)
 * User-provided headers override these defaults.
 *
 * @template T - Expected JSON response type (defaults to `unknown`)
 * @param url - The URL to request (must start with http:// or https://)
 * @param options - Request configuration options
 * @returns Promise resolving to parsed JSON data
 * @throws {Error} When request fails, response is not ok (status < 200 or >= 300), or JSON parsing fails
 *
 * @example
 * ```ts
 * // Simple JSON GET (automatically sets Accept: application/json)
 * const data = await httpJson('https://api.example.com/data')
 * console.log(data)
 *
 * // With type safety
 * interface User { id: number; name: string; email: string }
 * const user = await httpJson<User>('https://api.example.com/user/123')
 * console.log(user.name, user.email)
 *
 * // POST with JSON body (automatically sets Content-Type: application/json)
 * const result = await httpJson('https://api.example.com/users', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' })
 * })
 *
 * // With custom headers and retries
 * const data = await httpJson('https://api.example.com/data', {
 *   headers: {
 *     'Authorization': 'Bearer token123'
 *   },
 *   retries: 3,
 *   retryDelay: 1000
 * })
 * ```
 */
export async function httpJson<T = unknown>(
  url: string,
  options?: HttpRequestOptions | undefined,
): Promise<T> {
  const {
    body,
    headers = {},
    ...restOptions
  } = {
    __proto__: null,
    ...options,
  } as HttpRequestOptions

  // Set default headers for JSON requests
  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
  }

  // Add Content-Type when body is present
  if (body) {
    defaultHeaders['Content-Type'] = 'application/json'
  }

  // Merge headers: user headers override defaults
  const mergedHeaders = {
    ...defaultHeaders,
    ...headers,
  }

  // httpRequest may throw HttpResponseError when throwOnError is enabled.
  // Let it propagate — don't mask it with a generic Error.
  const response = await httpRequest(url, {
    body,
    headers: mergedHeaders,
    ...restOptions,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  try {
    return response.json<T>()
  } catch (e) {
    throw new Error('Failed to parse JSON response', { cause: e })
  }
}

/**
 * Make an HTTP/HTTPS request with retry logic and redirect support.
 * Provides a fetch-like API using Node.js native http/https modules.
 *
 * This is the main entry point for making HTTP requests. It handles retries,
 * redirects, timeouts, and provides a fetch-compatible response interface.
 *
 * @param url - The URL to request (must start with http:// or https://)
 * @param options - Request configuration options
 * @returns Promise resolving to response object with `.json()`, `.text()`, etc.
 * @throws {Error} When all retries are exhausted, timeout occurs, or non-retryable error happens
 *
 * @example
 * ```ts
 * // Simple GET request
 * const response = await httpRequest('https://api.example.com/data')
 * const data = response.json()
 *
 * // POST with JSON body
 * const response = await httpRequest('https://api.example.com/users', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' })
 * })
 *
 * // With retries and timeout
 * const response = await httpRequest('https://api.example.com/data', {
 *   retries: 3,
 *   retryDelay: 1000,
 *   timeout: 60000
 * })
 *
 * // Don't follow redirects
 * const response = await httpRequest('https://example.com/redirect', {
 *   followRedirects: false
 * })
 * console.log(response.status) // 301, 302, etc.
 * ```
 */
export async function httpRequest(
  url: string,
  options?: HttpRequestOptions | undefined,
): Promise<HttpResponse> {
  const {
    body,
    ca,
    followRedirects = true,
    headers = {},
    hooks,
    maxRedirects = 5,
    maxResponseSize,
    method = 'GET',
    onRetry,
    retries = 0,
    retryDelay = 1000,
    stream = false,
    throwOnError = false,
    timeout = 30_000,
  } = { __proto__: null, ...options } as HttpRequestOptions

  // Readable streams are one-shot — they cannot be replayed on retry or redirect.
  // Duck-type check: streams have a `pipe` method.
  const isStreamBody =
    body !== undefined &&
    typeof body === 'object' &&
    typeof (body as { pipe?: unknown }).pipe === 'function'

  if (isStreamBody && retries > 0) {
    throw new Error(
      'Streaming body (Readable/FormData) cannot be used with retries. ' +
        'Streams are consumed on first attempt and cannot be replayed. ' +
        'Set retries: 0 or buffer the body as a string/Buffer.',
    )
  }

  const attemptOpts: HttpRequestOptions = {
    body,
    ca,
    // Disable redirect following for stream bodies — the stream is consumed
    // on the first request and cannot be re-piped to the redirect target.
    followRedirects: isStreamBody ? false : followRedirects,
    headers,
    hooks,
    maxRedirects,
    maxResponseSize,
    method,
    stream,
    timeout,
  }

  // Retry logic with exponential backoff
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await httpRequestAttempt(url, attemptOpts)

      // When throwOnError is enabled, non-2xx responses become errors
      // so they can be retried or caught by callers.
      if (throwOnError && !response.ok) {
        throw new HttpResponseError(response)
      }

      return response
    } catch (e) {
      lastError = e as Error

      // Last attempt - throw error
      if (attempt === retries) {
        break
      }

      // Consult onRetry callback if provided.
      const delayMs = retryDelay * 2 ** attempt
      if (onRetry) {
        const retryResult = onRetry(attempt + 1, e, delayMs)
        // false = stop retrying, rethrow immediately.
        if (retryResult === false) {
          break
        }
        // A number overrides the delay (clamped to >= 0; NaN falls back to default).
        const actualDelay =
          typeof retryResult === 'number' && !Number.isNaN(retryResult)
            ? Math.max(0, retryResult)
            : delayMs
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, actualDelay))
      } else {
        // Default: retry with exponential backoff
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError || new Error('Request failed after retries')
}

/**
 * Perform an HTTP request and return text response.
 * Convenience wrapper around `httpRequest` for fetching text content.
 * Automatically sets appropriate headers for text requests:
 * - `Accept: text/plain` (always)
 * - `Content-Type: text/plain` (when body is present)
 * User-provided headers override these defaults.
 *
 * @param url - The URL to request (must start with http:// or https://)
 * @param options - Request configuration options
 * @returns Promise resolving to response body as UTF-8 string
 * @throws {Error} When request fails or response is not ok (status < 200 or >= 300)
 *
 * @example
 * ```ts
 * // Fetch HTML (automatically sets Accept: text/plain)
 * const html = await httpText('https://example.com')
 * console.log(html.includes('<!DOCTYPE html>'))
 *
 * // Fetch plain text
 * const text = await httpText('https://example.com/file.txt')
 * console.log(text)
 *
 * // POST with text body (automatically sets Content-Type: text/plain)
 * const result = await httpText('https://example.com/api', {
 *   method: 'POST',
 *   body: 'raw text data'
 * })
 *
 * // With custom headers (override defaults)
 * const text = await httpText('https://example.com/data.txt', {
 *   headers: {
 *     'Authorization': 'Bearer token123',
 *     'Accept': 'text/html'  // Override default Accept header
 *   }
 * })
 *
 * // With timeout
 * const text = await httpText('https://example.com/large-file.txt', {
 *   timeout: 60000 // 1 minute
 * })
 * ```
 */
export async function httpText(
  url: string,
  options?: HttpRequestOptions | undefined,
): Promise<string> {
  const {
    body,
    headers = {},
    ...restOptions
  } = {
    __proto__: null,
    ...options,
  } as HttpRequestOptions

  // Set default headers for text requests
  const defaultHeaders: Record<string, string> = {
    Accept: 'text/plain',
  }

  // Add Content-Type when body is present
  if (body) {
    defaultHeaders['Content-Type'] = 'text/plain'
  }

  // Merge headers: user headers override defaults
  const mergedHeaders = {
    ...defaultHeaders,
    ...headers,
  }

  // httpRequest may throw HttpResponseError when throwOnError is enabled.
  // Let it propagate — don't mask it with a generic Error.
  const response = await httpRequest(url, {
    body,
    headers: mergedHeaders,
    ...restOptions,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.text()
}

/**
 * Parse a checksums file text into a filename-to-hash map.
 *
 * Supports standard checksums file formats:
 * - BSD style: "SHA256 (filename) = hash"
 * - GNU style: "hash  filename" (two spaces)
 * - Simple style: "hash filename" (single space)
 *
 * Lines starting with '#' are treated as comments and ignored.
 * Empty lines are ignored.
 *
 * @param text - Raw text content of a checksums file
 * @returns Map of filenames to lowercase SHA256 hashes
 *
 * @example
 * ```ts
 * const text = `
 * # SHA256 checksums
 * e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  file.zip
 * abc123def456...  other.tar.gz
 * `
 * const checksums = parseChecksums(text)
 * console.log(checksums['file.zip']) // 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 * ```
 */
export function parseChecksums(text: string): Checksums {
  const checksums: Checksums = { __proto__: null } as unknown as Checksums

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    // Try BSD style: "SHA256 (filename) = hash"
    const bsdMatch = trimmed.match(
      /^SHA256\s+\((.+)\)\s+=\s+([a-fA-F0-9]{64})$/,
    )
    if (bsdMatch) {
      checksums[bsdMatch[1]!] = bsdMatch[2]!.toLowerCase()
      continue
    }

    // Try GNU/simple style: "hash  filename" or "hash filename"
    const gnuMatch = trimmed.match(/^([a-fA-F0-9]{64})\s+(.+)$/)
    if (gnuMatch) {
      checksums[gnuMatch[2]!] = gnuMatch[1]!.toLowerCase()
    }
  }

  return checksums
}

/**
 * Parse a `Retry-After` HTTP header value into milliseconds.
 *
 * Supports both formats defined in RFC 7231 §7.1.3:
 * - **delay-seconds**: integer number of seconds (e.g., `"120"`)
 * - **HTTP-date**: an absolute date/time (e.g., `"Fri, 31 Dec 2027 23:59:59 GMT"`)
 *
 * When the header is an array (multiple values), the first element is used.
 *
 * @param value - The raw Retry-After header value(s)
 * @returns Delay in milliseconds, or `undefined` if the value cannot be parsed
 *
 * @example
 * ```ts
 * const delay = parseRetryAfterHeader(response.headers['retry-after'])
 * if (delay !== undefined) {
 *   await new Promise(resolve => setTimeout(resolve, delay))
 * }
 * ```
 */
export function parseRetryAfterHeader(
  value: string | string[] | undefined,
): number | undefined {
  if (!value) {
    return undefined
  }
  // Handle array of values (take first).
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) {
    return undefined
  }
  // Try parsing as seconds (strict integer — reject partial like "10abc").
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed)
    return seconds * 1000
  }
  // Try parsing as HTTP date.
  const date = new Date(raw)
  if (!Number.isNaN(date.getTime())) {
    const delayMs = date.getTime() - Date.now()
    if (delayMs > 0) {
      return delayMs
    }
  }
  return undefined
}

/**
 * Read and buffer a client-side IncomingResponse into an HttpResponse.
 *
 * Useful when you have a raw response from code that bypasses
 * `httpRequest()` (e.g., multipart form-data uploads via `http.request()`,
 * or responses from third-party HTTP libraries) and need to convert it
 * into the standard HttpResponse interface.
 *
 * @example
 * ```typescript
 * const raw = await makeRawRequest('https://example.com/api')
 * const response = await readIncomingResponse(raw)
 * console.log(response.status, response.body.toString('utf8'))
 * ```
 */
export async function readIncomingResponse(
  msg: IncomingResponse,
): Promise<HttpResponse> {
  const chunks: Buffer[] = []
  for await (const chunk of msg) {
    chunks.push(chunk as Buffer)
  }
  const body = Buffer.concat(chunks)
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
    json: <T = unknown>() => JSON.parse(body.toString('utf8')) as T,
    ok: status >= 200 && status < 300,
    rawResponse: msg,
    status,
    statusText,
    text: () => body.toString('utf8'),
  }
}

/**
 * Redact sensitive HTTP headers for safe logging and telemetry.
 *
 * Replaces values of sensitive headers (Authorization, Cookie, etc.)
 * with `[REDACTED]`. Non-sensitive headers are passed through unchanged.
 * Array values are joined with `', '`.
 *
 * @param headers - HTTP headers to sanitize
 * @returns A new object with sensitive values redacted
 *
 * @example
 * ```ts
 * const safe = sanitizeHeaders({
 *   'authorization': 'Bearer secret',
 *   'content-type': 'application/json'
 * })
 * // { authorization: '[REDACTED]', 'content-type': 'application/json' }
 * ```
 */
export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!headers) {
    return {}
  }
  const sensitiveHeaders = new Set([
    'authorization',
    'cookie',
    'proxy-authorization',
    'proxy-authenticate',
    'set-cookie',
    'www-authenticate',
  ])
  const result: Record<string, string> = {
    __proto__: null,
  } as unknown as Record<string, string>
  for (const key of Object.keys(headers)) {
    const value = headers[key]
    if (sensitiveHeaders.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else if (Array.isArray(value)) {
      result[key] = value.join(', ')
    } else if (value !== undefined && value !== null) {
      result[key] = String(value)
    }
  }
  return result
}
