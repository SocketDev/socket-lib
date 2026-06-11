/// <reference lib="dom" />

import { fetchResponse } from './fetch/browser'

import { Uint8ArrayCtor } from '../primordials/array'

import { DateNow } from '../primordials/date'

import { ErrorCtor } from '../primordials/error'

import { HeadersPrototypeForEach } from '../primordials/headers'

import { JSONParse } from '../primordials/json'

import { MathPow } from '../primordials/math'

import { PromiseCtor } from '../primordials/promise'

import { StringPrototypeToLowerCase } from '../primordials/string'

/**
 * @file Browser-safe HTTP request layer — mirrors the public surface of
 *   `@socketsecurity/lib/http-request` (`httpJson`, `httpText`, `httpRequest`,
 *   `HttpResponseError`) but uses the browser's `fetch` API instead of Node's
 *   `node:https`. Designed for Chrome MV3 service workers, content scripts,
 *   popups, and any other browser context that doesn't have `node:http` /
 *   `node:https` / `node:stream`. Consumers import from
 *   `@socketsecurity/lib/http-request/browser` directly, OR from
 *   `@socketsecurity/lib/http-request` inside a bundler that resolves the
 *   `browser` package.json conditional (rolldown, vite, esbuild) — the bundler
 *   picks this entry automatically. API parity with the Node side is the goal —
 *   same function names, same option shapes (where browsers can support them),
 *   same error shape. Caveats:
 *
 *   - `HttpResponse.body` is `Uint8Array` here, vs Node's `Buffer`. Most callers
 *     use `arrayBuffer()` / `text()` / `json()` and don't care.
 *   - `HttpResponse.headers` is `Record<string, string>` here, vs Node's
 *     `IncomingHttpHeaders` (which has array-valued headers like `set-cookie`).
 *     Browser `fetch()` flattens repeated headers per spec.
 *   - Hooks (`onRequest` / `onResponse`) are not yet supported in the browser
 *     path. Add when needed.
 */

/**
 * Browser-side HTTP error. Mirrors the Node-side `HttpResponseError` shape
 * (same `.name`, same `.response.status/statusText` access pattern, same
 * `instanceof` semantics) but constructs from a `BrowserHttpResponse` instead
 * of a Node `HttpResponse`.
 */
export class HttpResponseError extends Error {
  response: BrowserHttpResponse

  constructor(response: BrowserHttpResponse, message?: string | undefined) {
    const statusCode = response.status ?? 'unknown'
    const statusMessage = response.statusText || 'No status message'
    super(message ?? `HTTP ${statusCode}: ${statusMessage}`)
    this.name = 'HttpResponseError'
    this.response = response
  }
}

/**
 * Combine an external `signal` with an internal `timeout`-driven
 * AbortController so either can cancel the in-flight fetch.
 */
export function combineSignals(
  external: AbortSignal | undefined,
  timeoutMs: number | undefined,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if (!timeoutMs) {
    return { signal: external, cleanup: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let externalListener: (() => void) | undefined
  if (external) {
    if (external.aborted) {
      controller.abort()
    } else {
      externalListener = () => controller.abort()
      external.addEventListener('abort', externalListener)
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      if (external && externalListener) {
        external.removeEventListener('abort', externalListener)
      }
    },
  }
}

// oxlint-disable-next-line socket/sort-source-methods -- attempt() is called by combineSignals-using paths below; declared near its callers
export async function attempt(
  url: string,
  options: BrowserHttpRequestOptions,
): Promise<BrowserHttpResponse> {
  options = { __proto__: null, ...options } as typeof options
  const method = options.method ?? 'GET'
  const init: RequestInit = { method }
  if (options.headers) {
    init.headers = options.headers
  }
  if (options.body !== undefined) {
    ;(init as { body?: BodyInit | null | undefined }).body =
      options.body as BodyInit
  }
  if (options.followRedirects === false) {
    init.redirect = 'manual'
  }
  const { signal, cleanup } = combineSignals(options.signal, options.timeout)
  if (signal) {
    init.signal = signal
  }
  const startedAt = DateNow()
  if (options.hooks?.onRequest) {
    options.hooks.onRequest({
      method,
      url,
      headers: options.headers,
      timeout: options.timeout,
    })
  }
  try {
    const response = await fetchResponse(url, init)
    const buffer = await response.arrayBuffer()
    if (
      options.maxResponseSize !== undefined &&
      buffer.byteLength > options.maxResponseSize
    ) {
      throw new ErrorCtor(
        `Response body (${buffer.byteLength} bytes) exceeds maxResponseSize (${options.maxResponseSize})`,
      )
    }
    const body = new Uint8ArrayCtor(buffer)
    const headers = headersToRecord(response.headers)
    if (options.hooks?.onResponse) {
      options.hooks.onResponse({
        method,
        url,
        duration: DateNow() - startedAt,
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return {
      body,
      headers,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url,
      arrayBuffer(): ArrayBuffer {
        return buffer
      },
      text(): string {
        return decodeText(body)
      },
      json<T = unknown>(): T {
        return JSONParse(decodeText(body)) as T
      },
    }
  } catch (err) {
    if (options.hooks?.onResponse) {
      options.hooks.onResponse({
        method,
        url,
        duration: DateNow() - startedAt,
        error: err instanceof Error ? err : new ErrorCtor(String(err)),
      })
    }
    throw err
  } finally {
    cleanup()
  }
}

export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Per-attempt request info passed to `hooks.onRequest`. Mirrors the Node-side
 * `HttpHookRequestInfo` shape so callers can share hook implementations.
 */
export interface BrowserHttpHookRequestInfo {
  method: string
  url: string
  headers?: Record<string, string> | undefined
  timeout?: number | undefined
}

/**
 * Per-attempt response info passed to `hooks.onResponse`. Either `status`
 * (success) or `error` (network failure) is populated.
 */
export interface BrowserHttpHookResponseInfo {
  method: string
  url: string
  duration: number
  status?: number | undefined
  statusText?: string | undefined
  headers?: Record<string, string> | undefined
  error?: Error | undefined
}

export interface BrowserHttpHooks {
  onRequest?: ((info: BrowserHttpHookRequestInfo) => void) | undefined
  onResponse?: ((info: BrowserHttpHookResponseInfo) => void) | undefined
}

export interface BrowserHttpRequestOptions {
  /**
   * Request body. Strings, Blobs, FormData, ArrayBuffer all pass through to
   * fetch unchanged. Objects are NOT auto-stringified — the convenience wrapper
   * `httpJson` handles JSON serialization.
   */
  body?: string | Blob | FormData | ArrayBuffer | Uint8Array | undefined
  /**
   * Whether to follow redirects automatically. Defaults to true (browser fetch
   * default). Setting `false` sets `redirect: 'manual'` so 3xx responses are
   * returned to the caller instead of followed.
   */
  followRedirects?: boolean | undefined
  /**
   * Request headers. Object form for ergonomics; passed through to fetch.
   */
  headers?: Record<string, string> | undefined
  /**
   * Lifecycle hooks for observing request/response events. Mirrors the
   * Node-side `hooks` field. Hooks fire per-attempt — retries trigger separate
   * hook calls.
   */
  hooks?: BrowserHttpHooks | undefined
  /**
   * Maximum response body size in bytes. Responses larger than this are
   * truncated and treated as a network failure (so retries can fire). Defaults
   * to no limit. Useful when calling untrusted endpoints.
   */
  maxResponseSize?: number | undefined
  /**
   * HTTP method. Defaults to GET.
   */
  method?: string | undefined
  /**
   * Number of retry attempts on 5xx / network failure. Defaults to 0 (no
   * retries).
   */
  retries?: number | undefined
  /**
   * Base delay (ms) between retries. Doubles per attempt (exponential).
   * Defaults to 250ms.
   */
  retryDelay?: number | undefined
  /**
   * Abort signal forwarded to fetch. Combined with `timeout` via
   * AbortController when both are present.
   */
  signal?: AbortSignal | undefined
  /**
   * Throw on non-2xx response. Defaults to false; `httpJson` / `httpText` set
   * this to true so callers don't have to check `.ok`.
   */
  throwOnError?: boolean | undefined
  /**
   * Per-attempt timeout in milliseconds. Implemented via AbortController;
   * exceeds the timeout aborts the fetch and the attempt counts as a network
   * failure (retryable). Defaults to no timeout (fetch defaults).
   */
  timeout?: number | undefined
}

/**
 * Browser-shaped HTTP response. Surface mirrors the Node-side `HttpResponse`
 * but with browser-native body types.
 */
export interface BrowserHttpResponse {
  /**
   * Raw response body. `Uint8Array` instead of Node's `Buffer`.
   */
  body: Uint8Array
  /**
   * Response headers, lowercased keys (matching Node side's lowercase
   * convention). Repeated headers are joined with `, ` per fetch spec.
   */
  headers: Record<string, string>
  /**
   * Convenience: true when status is 2xx.
   */
  ok: boolean
  /**
   * HTTP status code.
   */
  status: number
  /**
   * HTTP status text.
   */
  statusText: string
  /**
   * Final URL after any redirects.
   */
  url: string
  /**
   * Body as ArrayBuffer.
   */
  arrayBuffer(): ArrayBuffer
  /**
   * Body parsed as JSON. Throws on invalid JSON.
   */
  json<T = unknown>(): T
  /**
   * Body decoded as UTF-8 text.
   */
  text(): string
}

export function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  HeadersPrototypeForEach(headers, (value: string, key: string) => {
    out[StringPrototypeToLowerCase(key)] = value
  })
  return out
}

/**
 * GET / POST a JSON endpoint. Automatically sets `Accept: application/json` and
 * `Content-Type: application/json` (when a body is present). Throws
 * `HttpResponseError` on non-2xx.
 */
export async function httpJson<T = unknown>(
  url: string,
  options?: BrowserHttpRequestOptions | undefined,
): Promise<T> {
  const opts = options ?? {}
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(opts.headers ?? {}),
  }
  if (opts.body !== undefined && !('Content-Type' in headers)) {
    headers['Content-Type'] = 'application/json'
  }
  const response = await httpRequest(url, {
    ...opts,
    headers,
    throwOnError: true,
  })
  return response.json<T>()
}

/**
 * Lower-level HTTP request. Use `httpJson` / `httpText` for the common cases.
 * Returns the response unconditionally — callers inspect `.ok` or pass
 * `throwOnError: true` to get a thrown `HttpResponseError` on non-2xx.
 */
export async function httpRequest(
  url: string,
  options?: BrowserHttpRequestOptions | undefined,
): Promise<BrowserHttpResponse> {
  const opts = options ?? {}
  const maxAttempts = (opts.retries ?? 0) + 1
  const baseDelay = opts.retryDelay ?? 250
  let lastError: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await attempt(url, opts)
      // 5xx → eligible for retry
      if (response.status >= 500 && i + 1 < maxAttempts) {
        await sleep(baseDelay * MathPow(2, i))
        continue
      }
      if (opts.throwOnError && !response.ok) {
        throw new HttpResponseError(response)
      }
      return response
    } catch (err) {
      lastError = err
      // Network errors are eligible for retry; HttpResponseError thrown
      // by throwOnError is not (it's an explicit failure signal).
      if (err instanceof HttpResponseError) {
        throw err
      }
      if (i + 1 < maxAttempts) {
        await sleep(baseDelay * MathPow(2, i))
        continue
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new ErrorCtor(`HTTP request to ${url} failed`)
}

/**
 * GET / POST a text endpoint. Throws `HttpResponseError` on non-2xx.
 */
export async function httpText(
  url: string,
  options?: BrowserHttpRequestOptions | undefined,
): Promise<string> {
  const response = await httpRequest(url, {
    ...(options ?? {}),
    throwOnError: true,
  })
  return response.text()
}

export function sleep(ms: number): Promise<void> {
  return new PromiseCtor(resolve => setTimeout(resolve, ms))
}
