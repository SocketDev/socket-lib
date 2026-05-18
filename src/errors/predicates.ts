/**
 * @file Error type-guard predicates — `isError` (with the `isErrorBuiltin` /
 *   `isErrorShim` building blocks) and the libuv errno-code narrower
 *   `isErrnoException`. Both are cross-realm-safe (they use `[[ErrorData]]`
 *   slot semantics rather than `instanceof Error`).
 */

import { ObjectPrototypeToString } from '../primordials/object'
import { StringPrototypeCharCodeAt } from '../primordials/string'

/**
 * Reference to the native ES2025 `Error.isError` when the running engine ships
 * it, otherwise `undefined`. Exposed separately so tests and callers can detect
 * the fast-path without re-probing.
 */
export const isErrorBuiltin: ((value: unknown) => value is Error) | undefined =
  (Error as unknown as { isError?: (v: unknown) => v is Error }).isError

/**
 * Narrow a caught value to a Node.js `ErrnoException` — an Error with a `.code`
 * string set by libuv/syscall failures (e.g. `'ENOENT'`, `'EACCES'`, `'EBUSY'`,
 * `'EPERM'`). Cross-realm safe (builds on {@link isError}), and checks that
 * `code` is a string so a merely branded Error without a real errno code
 * returns `false`.
 *
 * @example
 *   try {
 *     await fsPromises.readFile(path)
 *   } catch (e) {
 *     if (isErrnoException(e) && e.code === 'ENOENT') {
 *       // … retry, or return default …
 *     } else {
 *       throw e
 *     }
 *   }
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
  const first = StringPrototypeCharCodeAt(code, 0)
  return first >= 65 /* 'A' */ && first <= 90 /* 'Z' */
}

/**
 * `Error.isError` fallback shim — the in-language approximation used when the
 * native ES2025 method isn't available.
 *
 * Exported separately so test suites on engines that ship the native method can
 * still exercise the shim branch directly. Consumers should prefer
 * {@link isError}, which picks the native method when present.
 */
export function isErrorShim(value: unknown): value is Error {
  if (value === null || typeof value !== 'object') {
    return false
  }
  return ObjectPrototypeToString(value) === '[object Error]'
}

/**
 * Prefer the native ES2025 `Error.isError` when available (exact
 * `[[ErrorData]]` slot check, cross-realm-safe); fall back to
 * {@link isErrorShim} otherwise.
 */
export const isError: (value: unknown) => value is Error =
  isErrorBuiltin ?? isErrorShim
