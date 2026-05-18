/**
 * @file SSRI parser — splits a `<algorithm>-<base64hash>` string into its
 *   component fields.
 */

import { ErrorCtor } from '../primordials/error'

/**
 * Parse SSRI format into components.
 *
 * Extracts the algorithm and base64 hash from an SSRI string.
 *
 * @example
 *   ;```typescript
 *   const { algorithm, base64Hash } = parseSsri(
 *     'sha256-dmgqn8O75il1F24lQfOagWiHfYKNXK2LVkYfw2rCuFY=',
 *   )
 *   // Returns: { algorithm: 'sha256', base64Hash: 'dmgqn8O75il1F24lQfOagWiHfYKNXK2LVkYfw2rCuFY=' }
 *   ```
 *
 * @param ssri - Hash in SSRI format.
 *
 * @returns Object with algorithm and base64Hash properties
 *
 * @throws Error if SSRI format is invalid
 */
/*@__NO_SIDE_EFFECTS__*/
export function parseSsri(ssri: string): {
  algorithm: string
  base64Hash: string
} {
  const match = /^([a-z0-9]+)-([A-Za-z0-9+/]+=*)$/i.exec(ssri)
  if (!match || !match[1] || !match[2] || match[2].length < 2) {
    throw new ErrorCtor(`Invalid SSRI format: ${ssri}`)
  }
  const algorithm = match[1]
  const base64Hash = match[2]
  return { algorithm, base64Hash }
}
