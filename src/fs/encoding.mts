/**
 * @file Encoding-name normalization. Maps user-supplied encoding strings (case-
 *   and dash-variant) to the canonical Node Buffer encoding tokens. Mirrors
 *   `internal/util.js#normalizeEncoding` so the common-case fast path is
 *   identical to Node's, and slow cases delegate to a separate function so v8
 *   will inline the hot one.
 */

import type { BufferEncoding } from './types.mjs'

/**
 * Normalize encoding string to canonical form. Handles common encodings inline
 * for performance, delegates to slowCases for others.
 *
 * Based on Node.js internal/util.js normalizeEncoding implementation.
 *
 * @example
 *   ;```ts
 *   normalizeEncoding('UTF-8') // Returns 'utf8'
 *   normalizeEncoding('binary') // Returns 'latin1'
 *   normalizeEncoding('ucs-2') // Returns 'utf16le'
 *   normalizeEncoding(null) // Returns 'utf8'
 *   ```
 *
 * @param enc - Encoding to normalize (can be null/undefined)
 *
 * @returns Normalized encoding string, defaults to 'utf8'
 *
 * @see https://github.com/nodejs/node/blob/ae62b36d442b7bf987e85ae6e0df0f02cc1bb17f/lib/internal/util.js#L247-L310
 */
export function normalizeEncoding(
  enc: BufferEncoding | string | null | undefined,
): BufferEncoding {
  return enc == null || enc === 'utf8' || enc === 'utf-8'
    ? 'utf8'
    : normalizeEncodingSlow(enc)
}

/**
 * Move the "slow cases" to a separate function to make sure this function gets
 * inlined properly. That prioritizes the common case.
 *
 * Based on Node.js internal/util.js normalizeEncoding implementation.
 *
 * @example
 *   ;```typescript
 *   normalizeEncodingSlow('ucs2') // 'utf16le'
 *   normalizeEncodingSlow('LATIN1') // 'latin1'
 *   normalizeEncodingSlow('binary') // 'latin1'
 *   ```
 *
 * @param enc - Encoding to normalize.
 *
 * @returns Normalized encoding string, defaults to 'utf8' for unknown encodings
 *
 * @see https://github.com/nodejs/node/blob/ae62b36d442b7bf987e85ae6e0df0f02cc1bb17f/lib/internal/util.js#L247-L310
 */
export function normalizeEncodingSlow(enc: string): BufferEncoding {
  switch (enc.toLowerCase()) {
    case 'ascii':
      return 'ascii'
    case 'base64':
      return 'base64'
    case 'base64url':
      return 'base64url'
    case 'binary':
    case 'latin1':
      return 'latin1'
    case 'hex':
      return 'hex'
    case 'ucs-2':
    case 'ucs2':
    case 'utf-16le':
    case 'utf16le':
      return 'utf16le'
    default:
      return 'utf8'
  }
}
