/**
 * @fileoverview Thin convenience wrappers over `httpRequest` —
 * `httpJson` and `httpText`. Both set sensible default `Accept`
 * (and `Content-Type` when a body is present) headers, then delegate
 * to `httpRequest`. User-supplied headers always win in the merge.
 *
 * Each wrapper throws `HttpResponseError` on non-2xx responses
 * (parallel to the `throwOnError` mode of `httpRequest`) so callers
 * never have to inspect `.ok` themselves.
 */

import { ErrorCtor } from '../primordials/error'
import { httpRequest } from './request'
import { HttpResponseError } from './response-types'

import type { HttpRequestOptions } from './request-types'

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
    throw new HttpResponseError(response)
  }

  try {
    return response.json<T>()
  } catch (e) {
    throw new ErrorCtor('Failed to parse JSON response', { cause: e })
  }
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
    throw new HttpResponseError(response)
  }

  return response.text()
}
