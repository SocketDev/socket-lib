/**
 * @fileoverview SEA (Single Executable Application) binary detection +
 * path accessor.
 *
 * Two responsibilities (mirror of `src/smol/util.ts` shape):
 *
 *   1. `isSeaBinary()` — memoized boolean detector for whether the
 *      current process is running as a Node.js Single Executable
 *      Application. Probes via Node 24+'s `node:sea.isSea()` native
 *      API; falls back to `false` on older runtimes.
 *
 *   2. `getSeaBinaryPath()` — returns the path of the SEA binary
 *      (`process.argv[0]` normalized) when running as SEA, otherwise
 *      `undefined`.
 *
 * Defensive across runtimes: returns `false` / `undefined` cleanly on
 * stock Node < 24, browsers, Deno, Bun.
 */

import process from 'node:process'

import { normalizePath } from '../paths/normalize'

/**
 * Cached SEA detection result.
 */
let _isSea: boolean | undefined

/**
 * Detect if the current process is running as a SEA binary.
 * Uses Node.js 24+ native API with caching for performance.
 *
 * @example
 * ```typescript
 * if (isSeaBinary()) {
 *   console.log('Running as a Single Executable Application')
 * }
 * ```
 */
export function isSeaBinary(): boolean {
  if (_isSea === undefined) {
    try {
      // Use Node.js 24+ native SEA detection API.
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
      const seaModule = require('node:sea')
      _isSea = seaModule.isSea()
    } catch {
      // Node.js < 24 or SEA module not available.
      _isSea = false
    }
  }
  return _isSea ?? false
}

/**
 * Get the current SEA binary path.
 * Only valid when running as a SEA binary.
 *
 * @example
 * ```typescript
 * const binPath = getSeaBinaryPath()
 * if (binPath) {
 *   console.log(`Running as SEA binary: ${binPath}`)
 * }
 * ```
 */
export function getSeaBinaryPath(): string | undefined {
  return isSeaBinary() && process.argv[0]
    ? normalizePath(process.argv[0])
    : undefined
}
