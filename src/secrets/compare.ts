/**
 * @file Constant-time secret comparison. Wraps Node's `crypto.timingSafeEqual`
 *   so every secret comparison in the codebase runs through one helper that
 *   refuses to short-circuit on the first mismatched byte. Why this matters:
 *
 *   - `===` / `!==` on JS strings short-circuits at the first byte mismatch. An
 *     attacker who can measure server response time can binary-search the
 *     secret one byte at a time: `'a000...'`, `'b000...'`, … until the response
 *     slows down at the right first byte, then on to byte 2. Same trap for
 *     `Buffer.compare` and `==`.
 *   - `crypto.timingSafeEqual` runs in O(n) regardless of where the first
 *     mismatch is. Each iteration is the same cost so the timing channel
 *     carries no information about which byte mismatched. Use whenever
 *     comparing two values that include a secret (session token, API key, MAC,
 *     expected-hash). Don't use for path strings or other non-secret
 *     comparisons — `===` is fine there and faster. Patterned after pilcrow's
 *     `crypto.go::constantTimeCompare`, the canonical shape in
 *     passwordless-example.auth.pilcrowonpaper.com — wrap once, use everywhere,
 *     never byte-compare a secret directly.
 */

import crypto from 'node:crypto'

/**
 * Compare two secrets in constant time. Returns `true` when the inputs are
 * byte-equal. Returns `false` when they differ **or** when the byte-lengths
 * differ. Never throws.
 *
 * Length mismatch handling: `timingSafeEqual` itself throws on length mismatch
 * (it can't preserve the timing-safety contract across differently- sized
 * buffers). We catch that and return `false` so callers don't need a length
 * pre-check.
 *
 * @example
 *   ;```typescript
 *   import { compareSecrets } from '@socketsecurity/lib/secrets/compare'
 *
 *   if (!compareSecrets(presentedToken, storedToken)) {
 *     throw new Error('invalid token')
 *   }
 *   ```
 *
 * @param a - First secret (string or Buffer).
 * @param b - Second secret (string or Buffer).
 *
 * @returns `true` when `a` and `b` are byte-equal; `false` otherwise.
 */
export function compareSecrets(
  a: Buffer | string,
  b: Buffer | string,
): boolean {
  const ab = typeof a === 'string' ? Buffer.from(a, 'utf8') : a
  const bb = typeof b === 'string' ? Buffer.from(b, 'utf8') : b
  // timingSafeEqual throws on length mismatch — by design, to preserve the
  // timing-safety contract. We catch that to give callers a plain boolean
  // (the length itself is already a side-channel any naive `===` exposes,
  // so we don't leak anything new by returning false here).
  if (ab.length !== bb.length) {
    return false
  }
  return crypto.timingSafeEqual(ab, bb)
}
