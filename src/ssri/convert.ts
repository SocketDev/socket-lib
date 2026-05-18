/**
 * @file SSRI ↔ hex digest conversion helpers — `hexToSsri` wraps a hex digest
 *   in `<algorithm>-<base64>` form, `ssriToHex` decodes the base64 half back to
 *   hex.
 */

import { BufferFrom, BufferPrototypeToString } from '../primordials/buffer'
import { ErrorCtor } from '../primordials/error'

/**
 * Convert hex format hash to SSRI format.
 *
 * Takes a hash in hex format and converts it to SSRI format with the specified
 * algorithm prefix (defaults to sha256).
 *
 * @example
 *   ;```typescript
 *   const ssri = hexToSsri(
 *     '76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856',
 *   )
 *   // Returns: 'sha256-dmgqn8O75il1F24lQfOagWiHfYKNXK2LVkYfw2rCuFY='
 *   ```
 *
 * @param hex - Hash in hex format.
 * @param algorithm - Hash algorithm (default: 'sha256')
 *
 * @returns SSRI format hash (algorithm-base64)
 *
 * @throws Error if hex format is invalid
 */
/*@__NO_SIDE_EFFECTS__*/
export function hexToSsri(hex: string, algorithm = 'sha256'): string {
  if (!/^[a-f0-9]+$/i.test(hex)) {
    throw new ErrorCtor(`Invalid hex format: ${hex}`)
  }
  // Convert hex to base64.
  const buffer = BufferFrom!(hex, 'hex')
  const base64Hash = BufferPrototypeToString!(buffer, 'base64')
  return `${algorithm}-${base64Hash}`
}

/**
 * Convert SSRI format hash to hex format.
 *
 * Takes a hash in SSRI format (e.g., "sha256-base64hash") and converts it to
 * standard hex format (e.g., "hexstring").
 *
 * @example
 *   ;```typescript
 *   const hex = ssriToHex(
 *     'sha256-dmgqn8O75il1F24lQfOagWiHfYKNXK2LVkYfw2rCuFY=',
 *   )
 *   // Returns: '76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856'
 *   ```
 *
 * @param ssri - Hash in SSRI format (algorithm-base64)
 *
 * @returns Hex string representation of the hash
 *
 * @throws Error if SSRI format is invalid
 */
/*@__NO_SIDE_EFFECTS__*/
export function ssriToHex(ssri: string): string {
  const match = /^([a-z0-9]+)-([A-Za-z0-9+/]+=*)$/i.exec(ssri)
  if (!match || !match[2] || match[2].length < 2) {
    throw new ErrorCtor(`Invalid SSRI format: ${ssri}`)
  }
  const base64Hash = match[2]
  // Convert base64 to hex.
  const buffer = BufferFrom!(base64Hash, 'base64')
  return BufferPrototypeToString!(buffer, 'hex')
}
