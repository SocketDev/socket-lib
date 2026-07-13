/**
 * @file SEA (Single Executable Application) binary detection + path accessor.
 *   Two responsibilities (mirror of `src/smol/detect.ts` shape):
 *
 *   1. `isSeaBinary()` — memoized boolean detector for whether the current process
 *      is running as a Node.js Single Executable Application. Probes via Node
 *      24+'s `node:sea.isSea()` native API; falls back to `false` on older
 *      runtimes.
 *   2. `getSeaBinaryPath()` — returns the path of the SEA binary
 *      (`process.argv[0]` normalized) when running as SEA, otherwise
 *      `undefined`. Defensive across runtimes: returns `false` / `undefined`
 *      cleanly on stock Node < 24, browsers, Deno, Bun.
 */

import process from 'node:process'

import { normalizePath } from '../paths/normalize'

/**
 * Cached SEA detection result.
 */
let isSeaCache: boolean | undefined

/**
 * Get the current SEA binary path. Only valid when running as a SEA binary.
 *
 * @example
 *   ```typescript
 *   const binPath = getSeaBinaryPath()
 *   if (binPath) {
 *   console.log(`Running as SEA binary: ${binPath}`)
 *   }
 *   ```
 */
export function getSeaBinaryPath(): string | undefined {
  return isSeaBinary() && process.argv[0]
    ? normalizePath(process.argv[0])
    : undefined
}

/**
 * Detect if the current process is running as a SEA binary. Uses Node.js 24+
 * native API with caching for performance.
 *
 * @example
 *   ;```typescript
 *   if (isSeaBinary()) {
 *     console.log('Running as a Single Executable Application')
 *   }
 *   ```
 */
export function isSeaBinary(): boolean {
  if (isSeaCache === undefined) {
    try {
      // Use Node.js 24+ native SEA detection API.
      const seaModule = require('node:sea')
      isSeaCache = seaModule.isSea()
      /* c8 ignore start - Node.js < 24 fallback; node:sea is in
         supported Node 22+ as of this codebase. */
    } catch {
      isSeaCache = false
    }
    /* c8 ignore stop */
  }
  return isSeaCache ?? false
}
