/**
 * @fileoverview Types for HTTP download + checksum-fetch operations.
 * Split out of `http-request/types.ts` for size hygiene.
 *
 *   - `HttpDownloadOptions` / `HttpDownloadResult` — file-download surface
 *   - `Checksums` / `FetchChecksumsOptions` — checksum-file helpers
 */

import type { IncomingHttpHeaders } from 'node:http'
import type { Logger } from '../logger/logger'

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
   * import { getDefaultLogger } from '@socketsecurity/lib/logger/logger'
   *
   * const logger = getDefaultLogger()
   * await httpDownload('https://example.com/file.zip', '/tmp/file.zip', {
   *   logger,
   *   progressInterval: 10  // Log every 10%
   * })
   * ```
   */
  logger?: Logger | undefined
  /**
   * Maximum number of redirects to follow before throwing an error.
   * Only relevant when `followRedirects` is `true`.
   *
   * @default 5
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
