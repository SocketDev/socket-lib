/**
 * @file Look up binaries on PATH. Two pairs of public functions: `which` /
 *   `whichSync` — wrap the upstream `which` package, returning the first
 *   matching path (or array with `{ all: true }`). Path-like inputs (absolute
 *   paths, `./relative`, `../relative`) bypass PATH resolution and pass through
 *   unchanged. Both are tolerant — they return `null` for not-found instead of
 *   throwing. `whichReal` / `whichRealSync` — same but resolve the result
 *   through `resolveRealBinSync` so the caller gets the underlying script path
 *   (e.g., `npm-cli.js`) rather than the wrapper. Default `nothrow: true` so a
 *   missing binary returns `undefined` instead of bubbling a `which` package
 *   error. `whichLocalBin` resolves a tool from the project-local
 *   `node_modules/.bin` (the inverse of `findRealBin`, which skips it). Caching
 *   matches `_internal.binPathCache` and `binPathAllCache`. Both caches
 *   validate hits with `existsSync` so a tool reinstall mid-session doesn't
 *   return a stale path.
 */

import process from 'node:process'

import whichModule from '../external/which'
import { isPath } from '../paths/normalize'
import { ArrayIsArray, ArrayPrototypeMap } from '../primordials/array'
import { binPathAllCache, binPathCache, getFs, getPath } from './_internal'
import { resolveRealBinSync } from './resolve'

import type { WhichOptions as ExternalWhichOptions } from '../external/which'
import type { WhichOptions } from './types'

/**
 * Find an executable in the system PATH asynchronously.
 *
 * This function resolves binary names to their full paths by searching the
 * system PATH. It should only be used for binary names (not paths). If the
 * input is already a path (absolute or relative), it will be returned as-is
 * without PATH resolution.
 *
 * Binary name vs. path detection:
 *
 * - Binary names: 'npm', 'git', 'node' - will be resolved via PATH
 * - Absolute paths: '/usr/bin/node', 'C:\Program Files\nodejs\node.exe' -
 *   returned as-is
 * - Relative paths: './node', '../bin/npm' - returned as-is
 *
 * @example
 *   ;```typescript
 *   // Resolve binary names
 *   await which('node') // '/usr/local/bin/node'
 *   await which('npm') // '/usr/local/bin/npm'
 *   await which('nonexistent') // null
 *
 *   // Paths are returned as-is
 *   await which('/usr/bin/node') // '/usr/bin/node'
 *   await which('./local-script') // './local-script'
 *   ```
 *
 * @param {string} binName - The binary name to resolve (e.g., 'npm', 'git')
 * @param {WhichOptions | undefined} options - Options for resolution.
 *
 * @returns {Promise<string | string[] | null>} Promise resolving to the full
 *   path, the original path, or null if not found.
 */
export async function which(
  binName: string,
  options?: WhichOptions | undefined,
): Promise<string | string[] | null> {
  // If binName is already a path (absolute or relative), return it as-is
  if (isPath(binName)) {
    return binName
  }

  try {
    // whichModule returns string when found, rejects when not found
    // whichModule is imported at the top
    /* c8 ignore next - External which call */
    const result = await whichModule(binName, options as ExternalWhichOptions)
    return result as string | string[]
  } catch {
    // Binary not found in PATH. Return type matches upstream `which`
    // package contract — public callers `instanceof check` distinguish
    // null vs string, so the lint rule's `undefined` recommendation
    // would break them.
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- matches upstream which package contract
    return null
  }
}

/**
 * Resolve a tool installed in the project-local `node_modules/.bin` to its
 * ABSOLUTE path. This is the inverse of findRealBin: that helper SKIPS
 * node_modules/.bin (shadow bins) to find the real package manager behind a
 * tool's shim, whereas whichLocalBin WANTS the local bin — it is for spawning a
 * dev dependency's own CLI (oxlint, vitest, tsc) directly instead of through
 * `pnpm exec`. Returns the platform-correct absolute path (the .cmd / .exe shim
 * on Windows, the symlink on POSIX), falling back to a plain PATH lookup, or
 * undefined when the tool resolves nowhere. `options.cwd` overrides the project
 * root whose node_modules/.bin is searched (default process.cwd()); an explicit
 * `options.path` replaces that local bin dir entirely.
 *
 * In npm's terminology this is "local" (vs "global" with `-g`): a locally
 * installed package's executables are linked into node_modules/.bin. See
 * https://docs.npmjs.com/cli/v11/configuring-npm/folders#executables.
 *
 * @example
 *   ;```typescript
 *   whichLocalBin('oxlint') // '/repo/node_modules/.bin/oxlint'
 *   whichLocalBin('missing') // undefined
 *   ```
 */
export function whichLocalBin(
  binName: string,
  options?: WhichOptions | undefined,
): string | undefined {
  const opts = { __proto__: null, ...options } as WhichOptions
  const path = getPath()
  const localBin =
    opts.path ?? path.join(opts.cwd ?? process.cwd(), 'node_modules', '.bin')
  const local = whichSync(binName, { nothrow: true, path: localBin })
  if (typeof local === 'string') {
    return local
  }
  const found = whichSync(binName, { nothrow: true })
  return typeof found === 'string' ? found : undefined
}

/**
 * Find a binary in the system PATH and resolve to the real underlying script
 * asynchronously. Resolves wrapper scripts (.cmd, .ps1, shell scripts) to the
 * actual .js files they execute.
 *
 * @example
 *   ;```typescript
 *   const npmPath = await whichReal('npm')
 *   // e.g. '/usr/local/lib/node_modules/npm/bin/npm-cli.js'
 *   ```
 *
 * @throws {Error} If the binary is not found and nothrow is false.
 */
export async function whichReal(
  binName: string,
  options?: WhichOptions | undefined,
): Promise<string | string[] | undefined> {
  const fs = getFs()
  // Default to nothrow: true if not specified to return undefined instead of throwing
  const opts = { __proto__: null, nothrow: true, ...options } as WhichOptions

  // Use cache - validate with existsSync() which is cheaper than full
  // PATH search. opts.all path tested via separate which-all callers;
  // stale-cache eviction fires only when a cached binary is removed
  // mid-session; result-undefined arm fires only when binary is missing.
  /* c8 ignore start */
  if (opts.all) {
    const cachedAll = binPathAllCache.get(binName)
    if (cachedAll && cachedAll.length > 0) {
      if (fs.existsSync(cachedAll[0]!)) {
        return cachedAll
      }
      binPathAllCache.delete(binName)
    }
  } else {
    const cached = binPathCache.get(binName)
    if (cached) {
      if (fs.existsSync(cached)) {
        return cached
      }
      binPathCache.delete(binName)
    }
  }
  /* c8 ignore stop */

  // Depending on options `whichModule` may throw if `binName` is not found.
  /* c8 ignore next - External which call */
  const result = await whichModule(binName, opts as ExternalWhichOptions)

  // opts.all (returns array) and not-found arms.
  /* c8 ignore start */
  if (opts?.all) {
    const paths = ArrayIsArray(result)
      ? result
      : typeof result === 'string'
        ? [result]
        : undefined
    if (paths?.length) {
      const resolved = ArrayPrototypeMap(paths, p => resolveRealBinSync(p))
      binPathAllCache.set(binName, resolved)
      return resolved
    }
    return paths
  }

  if (!result) {
    return undefined
  }
  /* c8 ignore stop */

  const resolved = resolveRealBinSync(result)
  // Cache the resolved path.
  binPathCache.set(binName, resolved)
  return resolved
}

/**
 * Find a binary in the system PATH and resolve to the real underlying script
 * synchronously. Resolves wrapper scripts (.cmd, .ps1, shell scripts) to the
 * actual .js files they execute.
 *
 * @example
 *   ;```typescript
 *   const npmPath = whichRealSync('npm')
 *   // e.g. '/usr/local/lib/node_modules/npm/bin/npm-cli.js'
 *   ```
 *
 * @throws {Error} If the binary is not found and nothrow is false.
 */
export function whichRealSync(
  binName: string,
  options?: WhichOptions | undefined,
): string | string[] | undefined {
  const fs = getFs()
  // Default to nothrow: true if not specified to return undefined instead of throwing
  const opts = { __proto__: null, nothrow: true, ...options } as WhichOptions

  // Use cache. See whichReal for branch reachability rationale.
  /* c8 ignore start */
  if (opts.all) {
    const cachedAll = binPathAllCache.get(binName)
    if (cachedAll && cachedAll.length > 0) {
      if (fs.existsSync(cachedAll[0]!)) {
        return cachedAll
      }
      binPathAllCache.delete(binName)
    }
  } else {
    const cached = binPathCache.get(binName)
    if (cached) {
      if (fs.existsSync(cached)) {
        return cached
      }
      binPathCache.delete(binName)
    }
  }
  /* c8 ignore stop */

  // Depending on options `which` may throw if `binName` is not found.
  // With nothrow: true, it returns null when `binName` is not found.
  const result = whichSync(binName, opts)

  // opts.all and not-found arms; see whichReal.
  /* c8 ignore start */
  if (opts.all) {
    const paths = ArrayIsArray(result)
      ? result
      : typeof result === 'string'
        ? [result]
        : undefined
    if (paths?.length) {
      const resolved = ArrayPrototypeMap(paths, p => resolveRealBinSync(p))
      binPathAllCache.set(binName, resolved)
      return resolved
    }
    return paths
  }

  if (!result) {
    return undefined
  }
  /* c8 ignore stop */

  const resolved = resolveRealBinSync(result as string)
  binPathCache.set(binName, resolved)
  return resolved
}

/**
 * Find an executable in the system PATH synchronously.
 *
 * This function resolves binary names to their full paths by searching the
 * system PATH. It should only be used for binary names (not paths). If the
 * input is already a path (absolute or relative), it will be returned as-is
 * without PATH resolution.
 *
 * Binary name vs. path detection:
 *
 * - Binary names: 'npm', 'git', 'node' - will be resolved via PATH
 * - Absolute paths: '/usr/bin/node', 'C:\Program Files\nodejs\node.exe' -
 *   returned as-is
 * - Relative paths: './node', '../bin/npm' - returned as-is
 *
 * @example
 *   ;```typescript
 *   // Resolve binary names
 *   whichSync('node') // '/usr/local/bin/node'
 *   whichSync('npm') // '/usr/local/bin/npm'
 *   whichSync('nonexistent') // null
 *
 *   // Paths are returned as-is
 *   whichSync('/usr/bin/node') // '/usr/bin/node'
 *   whichSync('./local-script') // './local-script'
 *   ```
 *
 * @param {string} binName - The binary name to resolve (e.g., 'npm', 'git')
 * @param {WhichOptions | undefined} options - Options for resolution.
 *
 * @returns {string | string[] | null} The full path to the binary, the original
 *   path if input is a path, or null if not found.
 */
export function whichSync(
  binName: string,
  options?: WhichOptions | undefined,
): string | string[] | null {
  // If binName is already a path (absolute or relative), return it as-is
  if (isPath(binName)) {
    return binName
  }

  try {
    // whichModule.sync returns string when found, throws when not found
    // whichModule is imported at the top
    const result = whichModule.sync(binName, options as ExternalWhichOptions)
    return result as string | string[]
  } catch {
    // Binary not found in PATH. Return type matches upstream `which`
    // package contract.
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- matches upstream which package contract
    return null
  }
}
