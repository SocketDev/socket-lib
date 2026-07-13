/**
 * @file Binary resolution for installed dlx packages.
 *
 *   - `findBinaryPath` — pick the right binary entry from package.json `bin`
 *   - `makePackageBinsExecutable` — chmod all bin entries to 0o755 on Unix
 *   - `resolveBinaryPath` — Windows wrapper (.cmd/.bat/.ps1/.exe) lookup Split
 *     out of `dlx/package.ts` for size hygiene. The cache used by
 *     `resolveBinaryPath` lives in `_internal.ts` so both this leaf and any
 *     direct consumers (`binaryPathCacheSet`) share one source.
 */

import { WIN32 } from '../constants/platform'
import { readJsonSync } from '../fs/read-json'
import libnpmexec from '../external/libnpmexec'
import { normalizePath } from '../paths/normalize'

import { ErrorCtor } from '../primordials/error'

import { ObjectKeys, ObjectValues } from '../primordials/object'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'

import { binaryPathCache, binaryPathCacheSet } from './_internal'

/**
 * Find the binary path for an installed package. Uses npm's bin resolution
 * strategy with user-friendly fallbacks. Resolves platform-specific wrappers
 * (.cmd, .ps1, etc.) on Windows.
 *
 * Resolution strategy (cherry-picked from libnpmexec): 1. Use npm's
 * getBinFromManifest (handles aliases and standard cases) 2. Fall back to
 * user-provided binaryName if npm's strategy fails 3. Try last segment of
 * package name as final fallback 4. Use first binary as last resort.
 *
 * @example
 *   ```typescript
 *   const binPath = findBinaryPath('/tmp/.socket/_dlx/a1b2c3d4', 'prettier')
 *   console.log(`Binary: ${binPath}`)
 *   ```
 */
export function findBinaryPath(
  packageDir: string,
  packageName: string,
  binaryName?: string,
): string {
  const path = getNodePath()
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )
  const pkgJsonPath = path.join(installedDir, 'package.json')

  // Read package.json to find bin entry.
  const pkgJson = readJsonSync(pkgJsonPath) as Record<string, unknown>
  const bin = pkgJson['bin']

  let binName: string | undefined
  let binPath: string | undefined

  if (typeof bin === 'string') {
    // Single binary - use it directly.
    binPath = bin
  } else if (typeof bin === 'object' && bin !== null) {
    const binObj = bin as Record<string, string>
    const binKeys = ObjectKeys(binObj)

    // If only one binary, use it regardless of name.
    if (binKeys.length === 1) {
      binName = binKeys[0]!
      binPath = binObj[binName]
    } else {
      // Multiple binaries - use npm's battle-tested resolution strategy first.
      try {
        // External libnpmexec call
        /* c8 ignore start */
        const { getBinFromManifest } = libnpmexec
        binName = getBinFromManifest({
          name: packageName,
          bin: binObj,
          _id: `${packageName}@${(pkgJson as { version?: string | undefined }).version || 'unknown'}`,
        })
        /* c8 ignore stop */
        binPath = binObj[binName]
      } catch {
        // npm's strategy failed - fall back to user-friendly resolution:
        // 1. User-provided binaryName
        // 2. Last segment of package name (e.g., 'cli' from '@socketsecurity/cli')
        // 3. First binary as fallback
        const lastSegment = packageName.split('/').pop() ?? packageName
        const candidates = [
          binaryName,
          lastSegment,
          packageName.replace(/^@[^/]+\//, ''),
        ].filter(Boolean)

        for (let i = 0, { length } = candidates; i < length; i += 1) {
          const candidate = candidates[i]!
          if (candidate && binObj[candidate]) {
            binName = candidate
            binPath = binObj[candidate]
            break
          }
        }

        // Fallback to first binary if nothing matched.
        if (!binPath && binKeys.length > 0) {
          binName = binKeys[0]!
          binPath = binObj[binName]
        }
      }
    }
  }

  if (!binPath) {
    throw new ErrorCtor(`No binary found for package "${packageName}"`)
  }

  const rawPath = normalizePath(path.join(installedDir, binPath))

  // Resolve platform-specific wrapper (Windows .cmd/.ps1/etc.)
  return resolveBinaryPath(rawPath)
}

/**
 * Make all binaries in an installed package executable. Reads the package.json
 * bin field and makes all binaries executable (chmod 0o755). Handles both
 * single binary (string) and multiple binaries (object) formats.
 *
 * Aligns with npm's approach: - Uses 0o755 permission (matches npm's cmd-shim)
 * - Reads bin field from package.json (matches npm's bin-links and libnpmexec)
 * - Handles both string and object bin formats.
 *
 * References: - npm cmd-shim:
 * https://github.com/npm/cmd-shim/blob/main/lib/index.js - npm
 * getBinFromManifest:
 * https://github.com/npm/libnpmexec/blob/main/lib/get-bin-from-manifest.js.
 *
 * @example
 *   ;```typescript
 *   makePackageBinsExecutable('/tmp/.socket/_dlx/a1b2c3d4', 'prettier')
 *   ```
 */
export function makePackageBinsExecutable(
  packageDir: string,
  packageName: string,
): void {
  if (WIN32) {
    // Windows doesn't need chmod
    return
  }

  const fs = getNodeFs()
  const path = getNodePath()
  const installedDir = normalizePath(
    path.join(packageDir, 'node_modules', packageName),
  )
  const pkgJsonPath = path.join(installedDir, 'package.json')

  try {
    const pkgJson = readJsonSync(pkgJsonPath) as Record<string, unknown>
    const bin = pkgJson['bin']

    if (!bin) {
      return
    }

    const binPaths: string[] = []

    if (typeof bin === 'string') {
      // Single binary
      binPaths.push(bin)
    } else if (typeof bin === 'object' && bin !== null) {
      // Multiple binaries
      const binObj = bin as Record<string, string>
      binPaths.push(...ObjectValues(binObj))
    }

    // Make all binaries executable
    for (let i = 0, { length } = binPaths; i < length; i += 1) {
      const binPath = binPaths[i]!
      const fullPath = normalizePath(path.join(installedDir, binPath))
      if (fs.existsSync(fullPath)) {
        try {
          fs.chmodSync(fullPath, 0o755)
        } catch {
          // Ignore chmod errors on individual binaries
        }
      }
    }
  } catch {
    // Ignore errors reading package.json or making binaries executable.
    // This is non-critical functionality.
  }
}

/**
 * Resolve binary path with cross-platform wrapper support. On Windows, checks
 * for .cmd, .bat, .ps1, .exe wrappers in order. On Unix, uses path directly.
 *
 * Aligns with npm/npx binary resolution strategy.
 *
 * @example
 *   ;```typescript
 *   const resolved = resolveBinaryPath('/tmp/.socket/_dlx/a1b2c3d4/prettier')
 *   // On Windows: may resolve to '.cmd' or '.ps1' wrapper
 *   // On Unix: returns the path unchanged
 *   ```
 */
export function resolveBinaryPath(basePath: string): string {
  if (!WIN32) {
    // Unix: use path directly
    return basePath
  }

  const fs = getNodeFs()

  // Check cache first - validate with existsSync.
  const cached = binaryPathCache.get(basePath)
  if (cached) {
    if (fs.existsSync(cached)) {
      // Bump recency on hit.
      binaryPathCacheSet(basePath, cached)
      return cached
    }
    // Cached path no longer exists, remove stale entry.
    binaryPathCache.delete(basePath)
  }

  // Windows: check for wrappers in priority order
  // Order matches npm bin-links creation: .cmd, .ps1, .exe, then bare
  const extensions = ['.cmd', '.bat', '.ps1', '.exe', '']

  for (let i = 0, { length } = extensions; i < length; i += 1) {
    const ext = extensions[i]!
    const testPath = basePath + ext
    if (fs.existsSync(testPath)) {
      // Cache the result.
      binaryPathCacheSet(basePath, testPath)
      return testPath
    }
  }

  // Fallback to original path if no wrapper found
  return basePath
}
