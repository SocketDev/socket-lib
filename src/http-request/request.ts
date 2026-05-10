/**
 * @fileoverview Core HTTP/HTTPS request loop.
 *
 * `httpRequest` is the main entry point — it wraps `httpRequestAttempt`
 * with retry / exponential-backoff logic and an optional `onRetry`
 * callback. `httpRequestAttempt` performs a single request and
 * resolves an `HttpResponse` (the fetch-like wrapper) or rejects with
 * an enriched `Error`. It also handles redirect chasing,
 * stream-mode bodies, FormData duck-typed header merging, and the
 * `maxResponseSize` guard.
 *
 * `readIncomingResponse` is the convertor for callers that already
 * have a raw `IncomingMessage` (e.g. multipart uploads via
 * `http.request()` directly) and want the same `HttpResponse` shape.
 *
 * `httpRequestAttempt` is exported (not private) per the
 * `export-top-level-functions` lint rule — it is shared with
 * `download.ts` which uses it in stream mode to drive
 * `httpDownloadAttempt`.
 */

import { setTimeout as delay } from 'node:timers/promises'

import { SOCKET_LIB_USER_AGENT } from '../constants/socket'
import { BufferConcat } from '../primordials/buffer'
import { DateNow } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'
import { JSONParse } from '../primordials/json'
import { MathMax } from '../primordials/math'
import { NumberIsNaN } from '../primordials/number'
import { PromiseCtor } from '../primordials/promise'
import { URLCtor } from '../primordials/url'
import { getHttp, getHttps } from './_internal'
import { enrichErrorMessage } from './errors'
import { HttpResponseError } from './types'

import type {
  HttpHookResponseInfo,
  HttpRequestOptions,
  HttpResponse,
  IncomingResponse,
} from './types'

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

/**
 * Single HTTP request attempt (used internally by httpRequest with retry logic).
 * Supports hooks (fire per-attempt), maxResponseSize, and rawResponse.
 */
export async function httpRequestAttempt(
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

  const startTime = DateNow()

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

  return await new PromiseCtor((resolve, reject) => {
    // Settled flag guards all resolve/reject paths so that at most one
    // fires, even when destroy() cascades multiple events.
    let settled = false
    const resolveOnce = (response: HttpResponse) => {
      // settled-already arm fires only on destroy() races where two
      // events fire after the first. Defensive.
      /* c8 ignore start */
      if (settled) {
        return
      }
      /* c8 ignore stop */
      settled = true
      resolve(response)
    }
    const rejectOnce = (err: Error) => {
      /* c8 ignore start */
      if (settled) {
        return
      }
      /* c8 ignore stop */
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

    const parsedUrl = new URLCtor(url)
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

    // ca + isHttps both required; tested individually but not always paired.
    /* c8 ignore next 3 */
    if (ca && isHttps) {
      requestOptions['ca'] = ca
    }

    const emitResponse = (info: Partial<HttpHookResponseInfo>) => {
      try {
        hooks?.onResponse?.({
          duration: DateNow() - startTime,
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

          // Strip auth/session headers on cross-origin redirects to prevent
          // leaking credentials to third-party hosts (e.g., GitHub -> S3).
          let redirectHeaders = headers
          if (new URL(url).origin !== redirectParsed.origin) {
            redirectHeaders = { __proto__: null } as unknown as typeof headers
            const stripped = new Set([
              'authorization',
              'cookie',
              'proxy-authenticate',
              'proxy-authorization',
            ])
            for (const key of Object.keys(headers)) {
              if (!stripped.has(key.toLowerCase())) {
                ;(redirectHeaders as Record<string, unknown>)[key] = (
                  headers as Record<string, unknown>
                )[key]
              }
            }
          }

          // Redirect chaining — Promise adoption handles the inner result.
          settled = true
          resolve(
            httpRequestAttempt(redirectUrl, {
              body,
              ca,
              followRedirects,
              headers: redirectHeaders,
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
