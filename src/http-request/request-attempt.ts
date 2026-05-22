/**
 * @file Single HTTP request attempt — the workhorse beneath the retrying
 *   `httpRequest` orchestrator. Split out of `http-request/request.ts` for size
 *   hygiene. Handles:
 *
 *   - Native `http`/`https` request issuance
 *   - Redirect chasing (with cross-origin auth-header stripping + HTTPS→HTTP
 *     downgrade refusal)
 *   - Stream-mode bodies (Readable / form-data duck-typed)
 *   - `maxResponseSize` enforcement
 *   - Hook lifecycle (`onRequest` pre-issue, `onResponse` settle-or-error)
 *     Exported (not private) so `download.ts` can drive it in stream mode for
 *     its own download-attempt loop.
 */

import { DateNow } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'
import { JSONParse } from '../primordials/json'
import { ObjectKeys } from '../primordials/object'
import { PromiseCtor } from '../primordials/promise'
import { URLCtor } from '../primordials/url'

import { getHttp, getHttps } from './_internal'
import { enrichErrorMessage } from './errors'
import { getSocketCallerUserAgent } from './user-agent'

import type {
  HttpHookResponseInfo,
  HttpRequestOptions,
  IncomingResponse,
} from './request-types'
import type { HttpResponse } from './response-types'

/**
 * Single HTTP request attempt (used internally by httpRequest with retry
 * logic). Supports hooks (fire per-attempt), maxResponseSize, and rawResponse.
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
    signal,
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
    'User-Agent': getSocketCallerUserAgent(),
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

    // AbortSignal supported by node:http request options (Node 22+).
    // Passes through to the underlying ClientRequest which listens
    // for `abort` and tears down the socket.
    if (signal) {
      requestOptions['signal'] = signal
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
              new ErrorCtor(
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
              new ErrorCtor(
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
            for (const key of ObjectKeys(headers)) {
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
              throw new ErrorCtor('Cannot parse JSON from a streaming response')
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
              new ErrorCtor(
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
              return JSONParse(responseBody.toString('utf8')) as T
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
      rejectOnce(new ErrorCtor(message, { cause: error }))
    })

    request.on('timeout', () => {
      request.destroy()
      rejectOnce(
        new ErrorCtor(
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
