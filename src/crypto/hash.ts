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

// Socket's content-addressed blob hash is `Q` + base64url(sha256(bytes)). The
// `S` (file-stream / chunked-manifest) discriminator shares the same digest
// body — its content is stored at the `Q`-swapped hash. Canonical scheme:
// depscan workspaces/lib/src/storage/hash.ts (blobHash). Keep in lock-step: if
// the upstream scheme changes, update here too.
const BLOB_HASH_PREFIX = 'Q'

/**
 * Compute the Socket content-address of `bytes`: `Q` +
 * base64url(sha256(bytes)).
 *
 * Matches the blob store's hash scheme so a fetched blob can be verified
 * against the hash it was requested by.
 *
 * @example
 *   ;```typescript
 *   import { blobHashOf } from '@socketsecurity/lib/crypto/hash'
 *
 *   blobHashOf(new TextEncoder().encode('hello'))
 *   ```
 */
export function blobHashOf(bytes: NodeJS.ArrayBufferView): string {
  return BLOB_HASH_PREFIX + hash('sha256', bytes, 'base64url')
}

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
  const crypto = getNodeCrypto()
  return crypto
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
    const fn = (getNodeCrypto() as { hash?: unknown | undefined }).hash
    if (typeof fn === 'function') {
      cachedNativeHash = fn as typeof NodeHash
    }
    nativeHashProbed = true
  }
  return cachedNativeHash
}

/**
 * Throw if `bytes` does not content-address to `blobHash`. Both `Q`-prefixed
 * (single blob) and `S`-prefixed (file-stream) hashes share the sha256 digest
 * body, so both verify against the same digest; the leading discriminator char
 * is dropped before comparison.
 *
 * @throws {Error} When the recomputed digest does not match `blobHash`.
 */
export function verifyBlobHash(
  blobHash: string,
  bytes: NodeJS.ArrayBufferView,
): void {
  const expectedDigest = blobHash.slice(1)
  const actualDigest = hash('sha256', bytes, 'base64url')
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `blob integrity check failed for ${blobHash}: content hashes to ` +
        `${BLOB_HASH_PREFIX}${actualDigest}`,
    )
  }
}
