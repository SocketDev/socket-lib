/**
 * @fileoverview Human-readable error-message extractor. `errorMessage`
 * walks the `cause` chain via pony-cause's `messageWithCauses` for
 * Errors and falls back to the shared `UNKNOWN_ERROR` sentinel for
 * everything else. `messageWithCauses` and `UNKNOWN_ERROR` are
 * re-exported for callers that need them directly.
 */

import { UNKNOWN_ERROR } from '../constants/sentinels'
import { messageWithCauses } from '../external/pony-cause'

import { isError } from './predicates'

export { UNKNOWN_ERROR, messageWithCauses }

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
