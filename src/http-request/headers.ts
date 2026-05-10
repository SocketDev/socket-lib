/**
 * @fileoverview Header utilities for HTTP/HTTPS requests.
 *
 * Two pure-data helpers:
 *   - `parseRetryAfterHeader` turns a `Retry-After` header value
 *     (delay-seconds OR HTTP-date per RFC 7231 §7.1.3) into a
 *     millisecond delay for `onRetry` callbacks.
 *   - `sanitizeHeaders` redacts `Authorization`, `Cookie`, and the
 *     other credential-bearing headers before they reach a logger or
 *     telemetry payload.
 *
 * No I/O — these can be imported anywhere without dragging the
 * Node.js `http`/`https` modules into the bundle.
 */

import { ArrayIsArray } from '../primordials/array'

import { DateCtor, DateNow } from '../primordials/date'

import { SetCtor } from '../primordials/map-set'

import { NumberIsNaN } from '../primordials/number'

import { ObjectKeys } from '../primordials/object'
const RETRY_AFTER_INT_RE = /^\d+$/

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
 * import { setTimeout as delay } from 'node:timers/promises'
 * const ms = parseRetryAfterHeader(response.headers['retry-after'])
 * if (ms !== undefined) {
 *   await delay(ms)
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
  const raw = ArrayIsArray(value) ? value[0] : value
  if (!raw) {
    return undefined
  }
  // Try parsing as seconds (strict integer — reject partial like "10abc").
  const trimmed = raw.trim()
  if (RETRY_AFTER_INT_RE.test(trimmed)) {
    const seconds = Number(trimmed)
    return seconds * 1000
  }
  // Try parsing as HTTP date.
  const date = new DateCtor(raw)
  if (!NumberIsNaN(date.getTime())) {
    const delayMs = date.getTime() - DateNow()
    if (delayMs > 0) {
      return delayMs
    }
  }
  return undefined
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
  const sensitiveHeaders = new SetCtor([
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
  for (const key of ObjectKeys(headers)) {
    const value = headers[key]
    if (sensitiveHeaders.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else if (ArrayIsArray(value)) {
      result[key] = value.join(', ')
    } else if (value !== undefined && value !== null) {
      result[key] = String(value)
    }
  }
  return result
}
