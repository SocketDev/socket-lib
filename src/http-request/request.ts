/**
 * @fileoverview Core HTTP/HTTPS request loop — the retry orchestrator.
 *
 * `httpRequest` is the main entry point: it wraps `httpRequestAttempt`
 * with retry / exponential-backoff logic and an optional `onRetry`
 * callback.
 *
 * Heavy lifting lives in sibling leaves and is re-exported here so
 * existing `http-request/request` importers keep working unchanged:
 *
 *   - `httpRequestAttempt` — single attempt + redirect chasing — `./request-attempt`
 *   - `readIncomingResponse` — IncomingMessage → HttpResponse — `./response-reader`
 */

import { setTimeout as delay } from 'node:timers/promises'

import { ErrorCtor } from '../primordials/error'
import { MathMax } from '../primordials/math'
import { NumberIsNaN } from '../primordials/number'

import { httpRequestAttempt } from './request-attempt'
import { HttpResponseError } from './response-types'

import type { HttpRequestOptions } from './request-types'
import type { HttpResponse } from './response-types'

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
    throw new ErrorCtor(
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
          typeof retryResult === 'number' && !NumberIsNaN(retryResult)
            ? MathMax(0, retryResult)
            : delayMs
        // eslint-disable-next-line no-await-in-loop
        await delay(actualDelay)
      } else {
        // Default: retry with exponential backoff
        // eslint-disable-next-line no-await-in-loop
        await delay(delayMs)
      }
    }
  }

  throw lastError || new ErrorCtor('Request failed after retries')
}

// Re-exports — preserve the historical `http-request/request` surface
// so downstream importers don't have to chase the split.
export { httpRequestAttempt } from './request-attempt'
export { readIncomingResponse } from './response-reader'
