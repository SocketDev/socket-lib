/**
 * @fileoverview Error utilities with cause chain support.
 *
 * Provides:
 *   - `isError(value)` — cross-realm-safe Error check (ES2025 `Error.isError`
 *     when available, `@@toStringTag` fallback otherwise).
 *   - `errorMessage(value)` — read the message (with cause chain) from any
 *     caught value, falling back to the shared `UNKNOWN_ERROR` sentinel.
 *   - `errorStack(value)` — read the stack (with cause chain) from any
 *     caught value, or `undefined` for non-Errors.
 *
 * `messageWithCauses` / `stackWithCauses` are re-exported from pony-cause;
 * a patched copy recognizes cross-realm Errors via `isError`.
 */

import { UNKNOWN_ERROR } from './constants/core'
import { messageWithCauses, stackWithCauses } from './external/pony-cause'
import { ObjectPrototypeToString } from './primordials'

export { UNKNOWN_ERROR, messageWithCauses, stackWithCauses }

/**
 * Spec-compliant [`Error.isError`](https://tc39.es/ecma262/#sec-error.iserror)
 * with a fallback shim for engines that don't ship it yet.
 *
 * Returns `true` for Errors from any realm (worker threads, vm contexts,
 * iframes) — things same-realm `instanceof Error` misses. Plain objects
 * with `name` + `message` properties are **not** recognized.
 *
 * @example
 * try {
 *   await doWork()
 * } catch (e) {
 *   if (isError(e)) {
 *     logger.error(e.message)
 *   } else {
 *     logger.error(String(e))
 *   }
 * }
 */
/**
 * `Error.isError` fallback shim — the in-language approximation used
 * when the native ES2025 method isn't available.
 *
 * Exported separately so test suites on engines that ship the native
 * method can still exercise the shim branch directly. Consumers should
 * prefer {@link isError}, which picks the native method when present.
 */
export function isErrorShim(value: unknown): value is Error {
  if (value === null || typeof value !== 'object') {
    return false
  }
  return ObjectPrototypeToString(value) === '[object Error]'
}

/**
 * Reference to the native ES2025 `Error.isError` when the running
 * engine ships it, otherwise `undefined`. Exposed separately so tests
 * and callers can detect the fast-path without re-probing.
 */
export const isErrorBuiltin: ((value: unknown) => value is Error) | undefined =
  (Error as unknown as { isError?: (v: unknown) => v is Error }).isError

/**
 * Prefer the native ES2025 `Error.isError` when available (exact
 * `[[ErrorData]]` slot check, cross-realm-safe); fall back to
 * {@link isErrorShim} otherwise.
 */
export const isError: (value: unknown) => value is Error =
  isErrorBuiltin ?? isErrorShim

/**
 * Narrow a caught value to a Node.js `ErrnoException` — an Error with a
 * `.code` string set by libuv/syscall failures (e.g. `'ENOENT'`,
 * `'EACCES'`, `'EBUSY'`, `'EPERM'`). Cross-realm safe (builds on
 * {@link isError}), and checks that `code` is a string so a merely
 * branded Error without a real errno code returns `false`.
 *
 * @example
 * try {
 *   await fsPromises.readFile(path)
 * } catch (e) {
 *   if (isErrnoException(e) && e.code === 'ENOENT') {
 *     // … retry, or return default …
 *   } else {
 *     throw e
 *   }
 * }
 */
export function isErrnoException(
  value: unknown,
): value is NodeJS.ErrnoException {
  if (!isError(value)) {
    return false
  }
  const code = (value as { code?: unknown }).code
  if (typeof code !== 'string' || code.length === 0) {
    return false
  }
  // libuv and Node.js errno codes always start with an uppercase
  // letter — libuv's `UV_E*` (ENOENT, EACCES, EBUSY, EPERM, EEXIST,
  // etc. — see include/uv/errno.h) and Node's `ERR_*` family
  // (https://nodejs.org/api/errors.html#nodejs-error-codes). Reject
  // Errors whose `.code` is lowercase (usually a package-specific tag)
  // rather than maintaining an exact allow-list that would drift on
  // every Node release.
  const first = code.charCodeAt(0)
  return first >= 65 /* 'A' */ && first <= 90 /* 'Z' */
}

/**
 * Extract a human-readable message from any caught value.
 *
 * Walks the `cause` chain for Errors (via {@link messageWithCauses});
 * coerces primitives and objects to string; returns
 * {@link UNKNOWN_ERROR} for `null`, `undefined`, empty strings,
 * `[object Object]`, or Errors with no message.
 *
 * @example
 * try {
 *   await readConfig(path)
 * } catch (e) {
 *   throw new Error(`Failed to read ${path}: ${errorMessage(e)}`, { cause: e })
 * }
 */
export function errorMessage(value: unknown): string {
  if (isError(value)) {
    return messageWithCauses(value) || UNKNOWN_ERROR
  }
  if (value === null || value === undefined) {
    return UNKNOWN_ERROR
  }
  const s = String(value)
  if (s === '' || s === '[object Object]') {
    return UNKNOWN_ERROR
  }
  return s
}

/**
 * Extract a stack trace (with causes) from any caught value.
 *
 * Returns the cause-aware stack via {@link stackWithCauses} for Errors;
 * returns `undefined` for non-Error values, so callers can
 * `logger.error(msg, { stack: errorStack(e) })` safely.
 */
export function errorStack(value: unknown): string | undefined {
  if (isError(value)) {
    return stackWithCauses(value)
  }
  return undefined
}
