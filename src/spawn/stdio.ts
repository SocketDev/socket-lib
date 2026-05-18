/**
 * @file Stdio configuration helpers for `spawn` callers. `isStdioType` is
 *   dual-purpose:
 *
 *   - One arg: validate that a value is a known stdio mode (`'pipe'` / `'ignore'`
 *     / `'inherit'` / `'overlapped'`).
 *   - Two args: check whether the caller's stdio config matches a specific mode.
 *     Useful in spinner-pause logic — the spinner only stops when the child
 *     writes to a non-piped stream that would otherwise interleave with spinner
 *     redraws. Two-arg behavior special-cases `null` / `undefined` ↔ `'pipe'`
 *     because Node.js defaults unspecified entries to `'pipe'`. The
 *     three-element-array branch handles the common `[in, out, err]` tuple
 *     where all three streams use the same mode.
 */

import { isArray } from '../arrays/predicates'

import type { StdioType } from './types'

/**
 * Check if stdio configuration matches a specific type. When called with one
 * argument, validates if it's a valid stdio type. When called with two
 * arguments, checks if the stdio config matches the specified type.
 *
 * @example
 *   // Check if valid stdio type
 *   isStdioType('pipe') // true
 *   isStdioType('invalid') // false
 *
 * @example
 *   // Check if stdio matches specific type
 *   isStdioType('pipe', 'pipe') // true
 *   isStdioType(['pipe', 'pipe', 'pipe'], 'pipe') // true
 *   isStdioType('ignore', 'pipe') // false
 *
 * @param {string | string[]} stdio - Stdio configuration to check.
 * @param {StdioType | undefined} type - Expected stdio type (optional)
 *
 * @returns {boolean} `true` if stdio matches the type or is valid
 */
/*@__NO_SIDE_EFFECTS__*/
export function isStdioType(
  stdio: string | string[],
  type?: StdioType | undefined,
): boolean {
  // If called with one argument, check if it's a valid stdio type.
  // biome-ignore lint/complexity/noArguments: Function overload detection for single vs two-arg calls.
  if (arguments.length === 1) {
    const validTypes = ['pipe', 'ignore', 'inherit', 'overlapped']
    return typeof stdio === 'string' && validTypes.includes(stdio)
  }
  // Original two-argument behavior.
  // Accept null/undefined as equivalent to 'pipe' because Node.js defaults
  // unspecified stdio entries to 'pipe'. Tests explicitly cover this contract.
  return (
    stdio === type ||
    ((stdio === null || stdio === undefined) && type === 'pipe') ||
    (isArray(stdio) &&
      stdio.length > 2 &&
      stdio[0] === type &&
      stdio[1] === type &&
      stdio[2] === type)
  )
}
