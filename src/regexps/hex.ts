/**
 * @fileoverview Hex-encoding helpers — fixed-width `\xHH` (`hex2`)
 * and `\uHHHH` (`hex4`) producers used by the spec-compliant
 * `RegExp.escape` fallback to emit canonical escape sequences.
 */

import { NumberPrototypeToString } from '../primordials/number'

export function hex2(n: number): string {
  return NumberPrototypeToString(n, 16).padStart(2, '0')
}

export function hex4(n: number): string {
  return NumberPrototypeToString(n, 16).padStart(4, '0')
}
