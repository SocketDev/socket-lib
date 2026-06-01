/**
 * @file Lazy-loader for socket-btm's `node:smol-vfs`. Targets the
 *   **post-alignment** shape that mirrors upstream `node:vfs` (PR
 *   nodejs/node#61478). socket-btm's runtime is being patched in lockstep with
 *   this lib to match. Alignment summary vs. upstream `node:vfs`:
 *
 *   - `node:smol-vfs` exports a single `getSmolVfs()` accessor that returns a
 *     `SmolVirtualFileSystem` instance pre-mounted at the SEA prefix (default
 *     `/sea`).
 *   - `vfs.mounted` (boolean), `vfs.mountPoint` (string | null) — instance
 *     getters matching upstream.
 *   - `vfs.extract(suffix)` — socket-btm-specific addition that returns a real-fs
 *     path to an embedded asset. Upstream `node:vfs` doesn't have this — you'd
 *     work via the patched `fs` namespace after `mount()`. We need real-fs
 *     paths to spawn binaries (Bazel, SBT launcher, JRE's `bin/java`), so btm
 *     carries this as a non-upstream extension.
 *   - No `NODE_VFS_PREFIX` env-var override anywhere; prefix is set at build time
 *     and immutable at runtime. Returns `undefined` on stock Node, non-Node
 *     runtimes, and on socket-btm binaries that haven't yet shipped the aligned
 *     binding. Result is cached across calls. Callers fall back to PATH lookup
 *     (or out-of-band downloads in socket-cli's case) when this is missing.
 */

import { isNodeBuiltin } from '../node/module'

/**
 * A `SmolVirtualFileSystem` instance mirroring upstream `node:vfs`'s
 * `VirtualFileSystem`. Named with the `Smol` prefix to avoid collision if a
 * consumer also imports `node:vfs`'s `VirtualFileSystem` in the same module —
 * both can coexist with explicit names.
 *
 * Only the properties + methods socket-lib's external-tools resolvers consume
 * are typed here. The full upstream surface (the `fs`-compatible reader API,
 * `provider`, `readonly`, `overlay`, `[Symbol.dispose]`, etc.) is intentionally
 * omitted — consumers that need them can widen the type at the callsite.
 */
export interface SmolVirtualFileSystem {
  /**
   * `true` once `mount(prefix)` has been called and not yet `unmount()`-ed.
   * Mirrors upstream's `vfs.mounted` getter.
   */
  readonly mounted: boolean
  /**
   * The path prefix this VFS is mounted at (e.g. `/sea`). `null` before
   * `mount()` runs. Mirrors upstream's `vfs.mountPoint`.
   */
  readonly mountPoint: string | null
  /**
   * Extract an embedded file or directory tree to the real filesystem and
   * return its absolute path. Idempotent — the VFS cache deduplicates writes
   * across repeated calls.
   *
   * `suffix` is a relative key inside the VFS payload (e.g. `'bazel'` or
   * `'jre'`); the binding handles prefix concatenation internally. Pass bare
   * keys, not `${mountPoint}/${suffix}`.
   *
   * NOT in upstream `node:vfs` — socket-btm extension for the "spawn an
   * embedded binary" use case. Upstream callers materialize indirectly via the
   * patched `fs.readFileSync` etc., which doesn't fit binary-execution flows.
   */
  extract(suffix: string): Promise<string>
  /**
   * Sync equivalent of `extract()`. Prefer the async form unless you need to
   * extract before the event loop is available (early bootstrap, native-addon
   * load).
   */
  extractSync(suffix: string): string
  /**
   * `true` if `suffix` is present in the embedded payload. Does NOT trigger
   * extraction. `suffix` is the bare relative key, same as `extract()`.
   */
  has(suffix: string): boolean
}

/**
 * Surface of `node:smol-vfs` (post-alignment).
 *
 * The module exports a single accessor — `getSmolVfs()` — which returns the
 * pre-mounted SEA VFS instance, or `undefined` when no SEA payload is
 * embedded.
 *
 * Note: the method name is `getSmolVfs` on both sides (this binding type AND
 * the lib's accessor below). socket-lib's `getSmolVfs()` is a memoizing
 * pass-through that calls `binding.getSmolVfs()` once per process.
 */
export interface SmolVirtualFileSystemBinding {
  /**
   * Returns the `SmolVirtualFileSystem` instance auto-mounted at the SEA prefix
   * (default `/sea`), or `undefined` when the binary has no embedded VFS
   * payload.
   */
  getSmolVfs(): SmolVirtualFileSystem | undefined
}

let cachedSmolVfs: SmolVirtualFileSystem | undefined
let smolVfsProbed = false

/**
 * Returns the pre-mounted SEA `SmolVirtualFileSystem` instance when running on
 * a smol Node binary with an embedded SEA payload; otherwise `undefined`.
 * Result is cached across calls.
 *
 * This is the only accessor external-tools resolvers need — the `node:smol-vfs`
 * binding-module loader is collapsed into this function so callers don't deal
 * with two indirection levels.
 */
export function getSmolVfs(): SmolVirtualFileSystem | undefined {
  if (!smolVfsProbed) {
    smolVfsProbed = true
    /* c8 ignore start - smol Node binary only. */
    if (isNodeBuiltin('node:smol-vfs')) {
      const binding = require('node:smol-vfs') as SmolVirtualFileSystemBinding
      cachedSmolVfs = binding.getSmolVfs()
    }
    /* c8 ignore stop */
  }
  return cachedSmolVfs
}
