/**
 * @file Crypto hash helpers that prefer Node builtins where available. Probes
 *   `node:crypto.hash()` (added v21.7.0 / v20.12.0) and falls back to the
 *   streaming `createHash().update().digest()` chain on older runtimes.
 */

import { getNodeCrypto } from '../node/crypto'

import type { hash as NodeHash } from 'node:crypto'

// `crypto.hash(algorithm, data, outputEncoding)` was added in Node
// v21.7.0 / v20.12.0 (Stable). Engines is >=22, so it's always present
// here in practice — feature-detect anyway because the type surface
// for `node:crypto` doesn't include it on every TS lib version.
//
// `cachedNativeHash` is the resolved native function (or `undefined` if
// absent or not yet probed). `nativeHashProbed` distinguishes the two cases
// so a missing native is detected only once.
let cachedNativeHash: typeof NodeHash | undefined
let nativeHashProbed = false

/**
 * Compute a one-shot cryptographic hash.
 *
 * Prefers Node's `crypto.hash(algorithm, data, outputEncoding)` (added v21.7.0
 * / v20.12.0), which is ~30% faster than the `createHash().update().digest()`
 * chain on small-to-medium inputs because it skips constructing the streaming
 * `Hash` object. Falls back to that chain on older runtimes.
 *
 * Use this only for the one-shot case where the entire input is available as a
 * single buffer or string; if you need to feed chunks, stay on `createHash()`.
 *
 * @example
 *   ;```typescript
 *   import { hash } from '@socketsecurity/lib/crypto/hash'
 *
 *   hash('sha256', 'hello', 'hex')
 *   // '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
 *
 *   hash('sha512', someBuffer, 'base64')
 *   // 'z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg=='
 *   ```
 */
export function hash(
  algorithm: string,
  data: string | NodeJS.ArrayBufferView,
  outputEncoding: 'hex' | 'base64' | 'base64url' | 'binary',
): string {
  const native = nativeHash()
  if (native !== undefined) {
    return native(algorithm, data, outputEncoding) as string
  }
  return getNodeCrypto()
    .createHash(algorithm)
    .update(data as string | Buffer)
    .digest(outputEncoding)
}

/**
 * Resolve `crypto.hash` (or `undefined` if the runtime predates it).
 *
 * Exported for unit tests; not part of the public API.
 *
 * @internal
 */
export function nativeHash(): typeof NodeHash | undefined {
  if (!nativeHashProbed) {
    const fn = (
      getNodeCrypto() as { hash?: unknown | undefined }
    ).hash
    if (typeof fn === 'function') {
      cachedNativeHash = fn as typeof NodeHash
    }
    nativeHashProbed = true
  }
  return cachedNativeHash
}
