/**
 * @file SSRI/hex format validators — predicates that report whether a string
 *   looks like a hex digest or an SSRI integrity string. Validation is purely
 *   lexical; the predicates do not verify algorithm strength or digest length.
 */

/**
 * Check if a string is valid hex format.
 *
 * Validates that a string contains only hexadecimal characters (0-9, a-f). Does
 * not verify hash length or algorithm.
 *
 * @example
 *   ;```typescript
 *   isValidHex(
 *     '76682a9fc3bbe62975176e2541f39a8168877d828d5cad8b56461fc36ac2b856',
 *   ) // true
 *   isValidHex('sha256-dmgqn8O75il1F24lQfOagWiHfYKNXK2LVkYfw2rCuFY=') // false
 *   ```
 *
 * @param value - String to validate.
 *
 * @returns True if string is valid hex format
 */
/*@__NO_SIDE_EFFECTS__*/
export function isValidHex(value: string): boolean {
  return /^[a-f0-9]+$/i.test(value)
}

/**
 * Check if a string is valid SSRI format.
 *
 * Validates that a string matches the SSRI format pattern (algorithm-base64).
 * Does not verify that the base64 encoding is valid.
 *
 * @example
 *   ;```typescript
 *   isValidSsri('sha256-dmgqn8O75il1F24lQfOagWiHfYKNXK2LVkYfw2rCuFY=') // true
 *   isValidSsri('76682a9f...') // false
 *   ```
 *
 * @param value - String to validate.
 *
 * @returns True if string matches SSRI format
 */
/*@__NO_SIDE_EFFECTS__*/
export function isValidSsri(value: string): boolean {
  return /^[a-z0-9]+-[A-Za-z0-9+/]{2,}=*$/i.test(value)
}
