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

import { safeDelete } from './fs.js'

let _fs: typeof import('node:fs') | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('fs')
  }
  return _fs as typeof import('node:fs')
}

import type { IncomingHttpHeaders, IncomingMessage } from 'http'

/** IncomingMessage received as a response to a client request (http.request callback). */
export type IncomingResponse = IncomingMessage

/** IncomingMessage received as a request in a server handler (http.createServer callback). */
export type IncomingRequest = IncomingMessage

import type { Logger } from './logger.js'

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
    _crypto = /*@__PURE__*/ require('crypto')
  }
  return _crypto as typeof import('node:crypto')
}

/**
 * Lazily load http and https modules to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getHttp() {
  if (_http === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _http = /*@__PURE__*/ require('http')
  }
  return _http as typeof import('node:http')
}

/*@__NO_SIDE_EFFECTS__*/
function getHttps() {
  if (_https === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _https = /*@__PURE__*/ require('https')
  }
  return _https as typeof import('node:https')
}

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
   * Can be a string (e.g., JSON) or Buffer (e.g., binary data).
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
   * ```
   */
  body?: Buffer | string | undefined
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
 * Read and buffer a client-side IncomingResponse into an HttpResponse.
 *
 * Useful when you have a raw response from code that bypasses
 * `httpRequest()` (e.g., multipart form-data uploads via `http.request()`,
 * or responses from third-party HTTP libraries) and need to convert it
 * into the standard HttpResponse interface.
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
  /**
   * Absolute path where the file was saved.
   *
   * @example
   * ```ts
   * const result = await httpDownload('https://example.com/file.zip', '/tmp/file.zip')
   * console.log(`Downloaded to: ${result.path}`)
   * ```
   */
  path: string
  /**
   * Total size of downloaded file in bytes.
   *
   * @example
   * ```ts
   * const result = await httpDownload('https://example.com/file.zip', '/tmp/file.zip')
   * console.log(`Downloaded ${result.size} bytes`)
   * ```
   */
  size: number
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
  const checksums: Checksums = { __proto__: null } as Checksums

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
      checksums[bsdMatch[1]] = bsdMatch[2].toLowerCase()
      continue
    }

    // Try GNU/simple style: "hash  filename" or "hash filename"
    const gnuMatch = trimmed.match(/^([a-fA-F0-9]{64})\s+(.+)$/)
    if (gnuMatch) {
      checksums[gnuMatch[2]] = gnuMatch[1].toLowerCase()
    }
  }

  return checksums
}

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
 * Single download attempt (used internally by httpDownload with retry logic).
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

  return await new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const httpModule = isHttps ? getHttps() : getHttp()

    const requestOptions: Record<string, unknown> = {
      headers: {
        'User-Agent': 'socket-registry/1.0',
        ...headers,
      },
      hostname: parsedUrl.hostname,
      method: 'GET',
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port,
      timeout,
    }

    // Pass custom CA certificates for TLS connections.
    if (ca && isHttps) {
      requestOptions['ca'] = ca
    }

    const { createWriteStream } = getFs()

    let fileStream: ReturnType<typeof createWriteStream> | undefined
    let streamClosed = false

    const closeStream = () => {
      if (!streamClosed && fileStream) {
        streamClosed = true
        fileStream.close()
      }
    }

    /* c8 ignore start - External HTTP/HTTPS download request */
    const request = httpModule.request(
      requestOptions,
      (res: IncomingResponse) => {
        // Handle redirects
        if (
          followRedirects &&
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (maxRedirects <= 0) {
            reject(
              new Error(
                `Too many redirects (exceeded maximum: ${maxRedirects})`,
              ),
            )
            return
          }

          // Follow redirect
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString()

          // Reject HTTPS-to-HTTP downgrade redirects.
          const redirectParsed = new URL(redirectUrl)
          if (isHttps && redirectParsed.protocol !== 'https:') {
            reject(
              new Error(
                `Redirect from HTTPS to HTTP is not allowed: ${redirectUrl}`,
              ),
            )
            return
          }

          resolve(
            httpDownloadAttempt(redirectUrl, destPath, {
              ca,
              followRedirects,
              headers,
              maxRedirects: maxRedirects - 1,
              onProgress,
              timeout,
            }),
          )
          return
        }

        // Check status code
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          closeStream()
          reject(
            new Error(
              `Download failed: HTTP ${res.statusCode} ${res.statusMessage}`,
            ),
          )
          return
        }

        const totalSize = Number.parseInt(
          res.headers['content-length'] || '0',
          10,
        )
        let downloadedSize = 0

        // Create write stream
        fileStream = createWriteStream(destPath)

        fileStream.on('error', (error: Error) => {
          closeStream()
          const err = new Error(`Failed to write file: ${error.message}`, {
            cause: error,
          })
          reject(err)
        })

        res.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length
          if (onProgress && totalSize > 0) {
            onProgress(downloadedSize, totalSize)
          }
        })

        res.on('end', () => {
          fileStream?.close(() => {
            streamClosed = true
            resolve({
              path: destPath,
              size: downloadedSize,
            })
          })
        })

        res.on('error', (error: Error) => {
          closeStream()
          reject(error)
        })

        // Pipe response to file
        res.pipe(fileStream)
      },
    )

    request.on('error', (error: Error) => {
      closeStream()
      const code = (error as NodeJS.ErrnoException).code
      let message = `HTTP download failed for ${url}: ${error.message}\n`

      if (code === 'ENOTFOUND') {
        message +=
          'DNS lookup failed. Check the hostname and your network connection.'
      } else if (code === 'ECONNREFUSED') {
        message +=
          'Connection refused. Verify the server is running and accessible.'
      } else if (code === 'ETIMEDOUT') {
        message +=
          'Request timed out. Check your network or increase the timeout value.'
      } else if (code === 'ECONNRESET') {
        message +=
          'Connection reset. The server may have closed the connection unexpectedly.'
      } else {
        message +=
          'Check your network connection and verify the URL is correct.'
      }

      reject(new Error(message, { cause: error }))
    })

    request.on('timeout', () => {
      request.destroy()
      closeStream()
      reject(new Error(`Download timed out after ${timeout}ms`))
    })

    request.end()
    /* c8 ignore stop */
  })
}

/**
 * Build an enriched error message based on the error code.
 * Generic guidance (no product-specific branding).
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
    timeout = 30_000,
  } = { __proto__: null, ...options } as HttpRequestOptions

  const startTime = Date.now()
  const mergedHeaders = {
    'User-Agent': 'socket-registry/1.0',
    ...headers,
  }

  hooks?.onRequest?.({ method, url, headers: mergedHeaders, timeout })

  return await new Promise((resolve, reject) => {
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
      hooks?.onResponse?.({
        duration: Date.now() - startTime,
        method,
        url,
        ...info,
      })
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
          emitResponse({
            headers: res.headers,
            status: res.statusCode,
            statusText: res.statusMessage,
          })

          if (maxRedirects <= 0) {
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
            reject(
              new Error(
                `Redirect from HTTPS to HTTP is not allowed: ${redirectUrl}`,
              ),
            )
            return
          }

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
              timeout,
            }),
          )
          return
        }

        const chunks: Buffer[] = []
        let totalBytes = 0

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length
          if (maxResponseSize && totalBytes > maxResponseSize) {
            res.destroy()
            const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2)
            const maxMB = (maxResponseSize / (1024 * 1024)).toFixed(2)
            const err = new Error(
              `Response exceeds maximum size limit (${sizeMB}MB > ${maxMB}MB)`,
            )
            emitResponse({ error: err })
            reject(err)
            return
          }
          chunks.push(chunk)
        })

        res.on('end', () => {
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

          resolve(response)
        })

        res.on('error', (error: Error) => {
          emitResponse({ error })
          reject(error)
        })
      },
    )

    request.on('error', (error: Error) => {
      const message = enrichErrorMessage(
        url,
        method,
        error as NodeJS.ErrnoException,
      )
      const enhanced = new Error(message, { cause: error })
      emitResponse({ error: enhanced })
      reject(enhanced)
    })

    request.on('timeout', () => {
      request.destroy()
      const err = new Error(
        `${method} request timed out after ${timeout}ms: ${url}\n→ Server did not respond in time.\n→ Try: Increase timeout or check network connectivity.`,
      )
      emitResponse({ error: err })
      reject(err)
    })

    if (body) {
      request.write(body)
    }

    request.end()
    /* c8 ignore stop */
  })
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
        path: destPath,
        size: result.size,
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
    retries = 0,
    retryDelay = 1000,
    timeout = 30_000,
  } = { __proto__: null, ...options } as HttpRequestOptions

  // Retry logic with exponential backoff
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await httpRequestAttempt(url, {
        body,
        ca,
        followRedirects,
        headers,
        hooks,
        maxRedirects,
        maxResponseSize,
        method,
        timeout,
      })
    } catch (e) {
      lastError = e as Error

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
