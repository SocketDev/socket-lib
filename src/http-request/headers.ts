/**
 * @file Header utilities for HTTP/HTTPS requests. Two pure-data helpers:
 *
 *   - `parseRetryAfterHeader` turns a `Retry-After` header value (delay-seconds
 *     OR HTTP-date per RFC 7231 §7.1.3) into a millisecond delay for `onRetry`
 *     callbacks.
 *   - `sanitizeHeaders` redacts `Authorization`, `Cookie`, and the other
 *     credential-bearing headers before they reach a logger or telemetry
 *     payload. No I/O — these can be imported anywhere without dragging the
 *     Node.js `http`/`https` modules into the bundle.
 */

import { ArrayIsArray } from '../primordials/array'

import { DateCtor, DateNow } from '../primordials/date'

import { btoa } from '../primordials/globals'

import { NumberIsNaN } from '../primordials/number'

import { ObjectKeys } from '../primordials/object'
const RETRY_AFTER_INT_RE = /^\d+$/

/**
 * Build an HTTP Basic `Authorization` header value from a Socket API token.
 *
 * The Socket API uses the token as the username with an empty password, so the
 * credential pair is `<token>:`. Centralized here so every fleet caller emits
 * the identical shape instead of hand-rolling `btoa(\`${token}:`)`.
 *
 * @example
 *   ;```ts
 *   const headers = { Authorization: basicAuthHeader(apiToken) }
 *   // { Authorization: 'Basic c2t0X3h4eHg6' }
 *   ```
 *
 * @param token - The Socket API token (used as the Basic-auth username).
 *
 * @returns The `Authorization` header value, e.g. `Basic <base64>`.
 */
/*@__NO_SIDE_EFFECTS__*/
export function basicAuthHeader(token: string): string {
  return `Basic ${btoa(`${token}:`)}`
}

// Match credential-bearing header names by shape rather than an enumerated
// list. A fixed list reads as complete while silently missing real headers
// (x-amz-security-token, api-key, x-functions-key, …); a name pattern catches
// the family. Same reasoning as the fleet's "a denylist is itself a leak" —
// don't try to name every secret, recognize the shape. The standard auth /
// cookie / proxy headers all contain one of these tokens, so they stay covered.
const SENSITIVE_HEADER_NAME_RE =
  /auth|cookie|credential|key|password|secret|token/i

/**
 * Whether a header name looks credential-bearing and should be redacted from
 * logs and telemetry. Case-insensitive substring match on the name only — the
 * value is never inspected.
 *
 * @param name - The header name (e.g. `Authorization`, `x-api-key`).
 *
 * @returns `true` when the value should be replaced with `[REDACTED]`.
 */
export function isSensitiveHeaderName(name: string): boolean {
  return SENSITIVE_HEADER_NAME_RE.test(name)
}

/**
 * Parse a `Retry-After` HTTP header value into milliseconds.
 *
 * Supports both formats defined in RFC 7231 §7.1.3:
 *
 * - **delay-seconds**: integer number of seconds (e.g., `"120"`)
 * - **HTTP-date**: an absolute date/time (e.g., `"Fri, 31 Dec 2027 23:59:59
 *   GMT"`)
 *
 * When the header is an array (multiple values), the first element is used.
 *
 * @example
 *   ;```ts
 *   import { setTimeout as delay } from 'node:timers/promises'
 *   const ms = parseRetryAfterHeader(response.headers['retry-after'])
 *   if (ms !== undefined) {
 *     await delay(ms)
 *   }
 *   ```
 *
 * @param value - The raw Retry-After header value(s)
 *
 * @returns Delay in milliseconds, or `undefined` if the value cannot be parsed
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
 * Replaces values of credential-bearing headers with `[REDACTED]`, matching the
 * header name by shape (see `isSensitiveHeaderName`) so custom token headers
 * are covered without an enumerated list. Non-sensitive headers pass through
 * unchanged. Array values are joined with `', '`.
 *
 * @example
 *   ;```ts
 *   const safe = sanitizeHeaders({
 *     authorization: 'Bearer secret',
 *     'content-type': 'application/json',
 *   })
 *   // { authorization: '[REDACTED]', 'content-type': 'application/json' }
 *   ```
 *
 * @param headers - HTTP headers to sanitize.
 *
 * @returns A new object with sensitive values redacted
 */
export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!headers) {
    return {}
  }
  const result: Record<string, string> = {
    __proto__: null,
  } as unknown as Record<string, string>
  for (const key of ObjectKeys(headers)) {
    const value = headers[key]
    if (isSensitiveHeaderName(key)) {
      result[key] = '[REDACTED]'
    } else if (ArrayIsArray(value)) {
      result[key] = value.join(', ')
    } else if (value !== undefined && value !== null) {
      result[key] = String(value)
    }
  }
  return result
}
