/**
 * @file `execBin` — spawn a binary with PATH resolution, wrapper-script
 *   unwrapping, and Windows shell handling. Order of operations:
 *
 *   1. If the input looks like a path (absolute or relative), `resolveRealBinSync`
 *      it directly so we can spawn the underlying script rather than a
 *      wrapper.
 *   2. Otherwise treat it as a binary name and:
 *
 *   - Hit `binPathCache`. If valid (`existsSync`), use the cached path; if stale,
 *     evict.
 *   - Fall through to `whichReal` for a fresh PATH search; cache the result on
 *     success.
 *
 *   3. Spawn with `shell: WIN32` so `.cmd` wrappers work on Windows; POSIX bypass
 *      since direct `execve` is faster.
 *   4. On not-found, throw a typed `ENOENT` error with operator guidance — far
 *      more useful than a bare "command not found".
 */

import { WIN32 } from '../constants/platform'
import { isPath } from '../paths/normalize'
import { ArrayIsArray } from '../primordials/array'
import { ErrorCtor } from '../primordials/error'
import { spawn } from '../spawn/spawn'

import { binPathCache, getFs } from './_internal'
import { resolveRealBinSync } from './resolve'
import { whichReal } from './which'

import type { SpawnOptions } from '../spawn/types'

/**
 * Execute a binary with the given arguments.
 *
 * @example
 *   ;```typescript
 *   await execBin('pnpm', ['install'])
 *   await execBin('/usr/local/bin/node', ['script.js'], { cwd: '/tmp' })
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function execBin(
  binPath: string,
  args?: string[],
  options?: SpawnOptions,
) {
  // Resolve the binary path, using cache for binary names (not paths).
  let resolvedPath: string | string[] | undefined
  if (isPath(binPath)) {
    resolvedPath = resolveRealBinSync(binPath)
  } else {
    // Check cache first for binary names.
    // Validate with existsSync() - cheaper than full PATH search.
    const cached = binPathCache.get(binPath)
    // Cache hit branches: warm cache validates with existsSync, cold
    // cache falls through. Stale-cache eviction fires only when a
    // previously cached binary is removed mid-session.
    /* c8 ignore start */
    if (cached) {
      if (getFs().existsSync(cached)) {
        resolvedPath = cached
      } else {
        binPathCache.delete(binPath)
      }
    }
    /* c8 ignore stop */
    if (!resolvedPath) {
      resolvedPath = await whichReal(binPath)
      // Cache the result if found.
      if (typeof resolvedPath === 'string') {
        binPathCache.set(binPath, resolvedPath)
      }
    }
  }

  if (!resolvedPath) {
    const error = new ErrorCtor(
      `Binary not found: ${binPath}\n` +
        'Possible causes:\n' +
        `  - Binary "${binPath}" is not installed or not in PATH\n` +
        '  - Binary name is incorrect or misspelled\n' +
        '  - Installation directory is not in system PATH\n' +
        'To resolve:\n' +
        `  1. Verify "${binPath}" is installed: which ${binPath} (Unix) or where ${binPath} (Windows)\n` +
        `  2. Install the binary if missing, ex: npm install -g ${binPath}\n` +
        '  3. Check PATH environment variable includes the binary location',
    ) as Error & {
      code: string
    }
    error.code = 'ENOENT'
    throw error
  }

  // Execute the binary directly. Array-resolvedPath arm only fires
  // when whichReal returns multiple paths via opts.all; execBin's
  // path doesn't request that.
  /* c8 ignore start */
  const binCommand = ArrayIsArray(resolvedPath)
    ? resolvedPath[0]!
    : resolvedPath
  /* c8 ignore stop */
  // On Windows, binaries are often .cmd files that require shell to execute.
  return await spawn(binCommand, args ?? [], {
    shell: WIN32,
    ...options,
  })
}
