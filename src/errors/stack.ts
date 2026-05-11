/**
 * @fileoverview Stack-trace extractor with cause-chain support.
 * `errorStack` returns the cause-aware stack via pony-cause's
 * `stackWithCauses` for Errors, and `undefined` for non-Error values
 * so callers can log conditionally. `stackWithCauses` is re-exported
 * for direct use.
 */

import { stackWithCauses } from '../external/pony-cause'

import { isError } from './predicates'

export { stackWithCauses }

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
