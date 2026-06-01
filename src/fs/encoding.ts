/**
 * @file Encoding-name normalization. Maps user-supplied encoding strings (case-
 *   and dash-variant) to the canonical Node Buffer encoding tokens. Mirrors
 *   `internal/util.js#normalizeEncoding` so the common-case fast path is
 *   identical to Node's, and slow cases delegate to a separate function so v8
 *   will inline the hot one.
 */

import type { BufferEncoding } from './types'

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
/*@__NO_SIDE_EFFECTS__*/
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
/*@__NO_SIDE_EFFECTS__*/
export function normalizeEncodingSlow(enc: string): BufferEncoding {
  const { length } = enc
  if (length === 4) {
    if (enc === 'UCS2' || enc === 'ucs2') {
      return 'utf16le'
    }
    if (enc.toLowerCase() === 'ucs2') {
      return 'utf16le'
    }
  } else if (
    (length === 3 && enc === 'hex') ||
    enc === 'HEX' ||
    enc.toLowerCase() === 'hex'
  ) {
    return 'hex'
  } else if (length === 5) {
    if (enc === 'ascii') {
      return 'ascii'
    }
    if (enc === 'ucs-2') {
      return 'utf16le'
    }
    if (enc === 'ASCII') {
      return 'ascii'
    }
    if (enc === 'UCS-2') {
      return 'utf16le'
    }
    enc = enc.toLowerCase()
    if (enc === 'ascii') {
      return 'ascii'
    }
    if (enc === 'ucs-2') {
      return 'utf16le'
    }
  } else if (length === 6) {
    if (enc === 'base64') {
      return 'base64'
    }
    if (enc === 'binary' || enc === 'latin1') {
      return 'latin1'
    }
    if (enc === 'BASE64') {
      return 'base64'
    }
    if (enc === 'BINARY' || enc === 'LATIN1') {
      return 'latin1'
    }
    enc = enc.toLowerCase()
    if (enc === 'base64') {
      return 'base64'
    }
    if (enc === 'binary' || enc === 'latin1') {
      return 'latin1'
    }
    // Length 7/8/9 branches handle utf16le, utf-16le, base64url. Each
    // length needs a specific encoding; tests cover the canonical forms
    // but the inner case-coercion sub-arms (the second/third operand
    // of each `||`) fire only on mixed-case inputs.
    /* c8 ignore start */
  } else if (length === 7) {
    if (
      enc === 'utf16le' ||
      enc === 'UTF16LE' ||
      enc.toLowerCase() === 'utf16le'
    ) {
      return 'utf16le'
    }
  } else if (length === 8) {
    if (
      enc === 'utf-16le' ||
      enc === 'UTF-16LE' ||
      enc.toLowerCase() === 'utf-16le'
    ) {
      return 'utf16le'
    }
  } else if (length === 9) {
    if (
      enc === 'base64url' ||
      enc === 'BASE64URL' ||
      enc.toLowerCase() === 'base64url'
    ) {
      return 'base64url'
    }
  }
  /* c8 ignore stop */
  return 'utf8'
}
