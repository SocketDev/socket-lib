/* oxlint-disable socket/sort-source-methods -- helper functions are interleaved with `readPackageJson` and cache state needed by them; reordering would split that state or change initialization order. */
/**
 * @file Executable type detection for DLX and local filesystem paths. Provides
 *   utilities to detect whether a path is a Node.js package or native binary
 *   executable. Supports both DLX cache paths and local filesystem paths. Key
 *   Functions:
 *
 *   - detectExecutableType: Generic entry point for any path
 *   - detectDlxExecutableType: DLX cache specific detection
 *   - detectLocalExecutableType: Local filesystem specific detection Detection
 *     Strategies:
 *   - DLX cache: Check for node_modules/ directory
 *   - Local paths: Check for package.json with bin field, then file extension
 */

import { isInSocketDlx } from './paths'
import { findUpSync } from '../fs/find-up'
import { getSocketDlxDir } from '../paths/socket'

import { DateNow } from '../primordials/date'

import { JSONParse } from '../primordials/json'

import { MapCtor, SetCtor } from '../primordials/map-set'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'

/**
 * Node.js script file extensions.
 */
const NODE_JS_EXTENSIONS = new SetCtor(['.js', '.mjs', '.cjs'] as const)

// Cache for package.json path lookups to avoid repeated directory traversal.
// Bounded LRU so long-lived processes don't accumulate entries for every
// distinct startDir they've ever seen. Negative entries (null) are
// short-lived — we re-probe after TTL expiry so a dir that later gains
// a package.json isn't permanently stuck at "none found".
const PACKAGE_JSON_PATH_CACHE_MAX_SIZE = 200
const PACKAGE_JSON_NEGATIVE_TTL_MS = 10_000
type PackageJsonPathEntry = {
  path: string | undefined
  at: number
}
const packageJsonPathCache = new MapCtor<string, PackageJsonPathEntry>()

export function packageJsonPathCacheSet(
  key: string,
  value: string | undefined,
): void {
  if (packageJsonPathCache.has(key)) {
    packageJsonPathCache.delete(key)
  } else if (packageJsonPathCache.size >= PACKAGE_JSON_PATH_CACHE_MAX_SIZE) {
    const oldest = packageJsonPathCache.keys().next().value
    if (oldest !== undefined) {
      packageJsonPathCache.delete(oldest)
    }
  }
  packageJsonPathCache.set(key, { path: value, at: Date.now() })
}

// Cache for parsed package.json content keyed by path + mtime so stale
// content is not served if the file is modified or replaced.
type PackageJsonCacheEntry = {
  mtimeMs: number
  content: object | undefined
}
const packageJsonContentCache = new MapCtor<string, PackageJsonCacheEntry>()

export type ExecutableType = 'package' | 'binary' | 'unknown'

export interface ExecutableDetectionResult {
  type: ExecutableType
  method: 'dlx-cache' | 'package-json' | 'file-extension'
  packageJsonPath?: string
  inDlxCache?: boolean
}

/**
 * Find package.json in the directory containing the file or parent directories.
 * Results are cached to avoid repeated directory traversal.
 *
 * @private
 *
 * @param filePath - Path to search from.
 *
 * @returns Path to package.json if found, undefined otherwise
 */
export function findPackageJson(filePath: string): string | undefined {
  const fs = getNodeFs()
  const nodePath = getNodePath()

  const startDir = nodePath.dirname(nodePath.resolve(filePath))

  // Check cache first.
  const cached = packageJsonPathCache.get(startDir)
  if (cached !== undefined) {
    // Negative entries expire after a short TTL so a directory that later
    // gains a package.json (npm install in a sibling workspace, etc.) is
    // re-probed instead of permanently stuck on the cached "not found".
    if (cached.path === undefined) {
      if (DateNow() - cached.at < PACKAGE_JSON_NEGATIVE_TTL_MS) {
        return undefined
      }
      packageJsonPathCache.delete(startDir)
    } else if (fs.existsSync(cached.path)) {
      // Bump recency on hit.
      packageJsonPathCacheSet(startDir, cached.path)
      return cached.path
    } else {
      // Cached path no longer exists, remove stale entry.
      packageJsonPathCache.delete(startDir)
    }
  }

  // findUpSync walks ancestors (incl. filesystem root) and matches a
  // file named package.json — the LRU + negative-TTL cache around it
  // is this function's contribution. The previous inline
  // `while (dir !== root)` loop never visited root, so a package.json
  // at `/package.json` was missed; findUpSync includes root.
  // findUpSync already returns a normalized (forward-slash) path, so the
  // API output is identical across platforms without re-normalizing here.
  const packageJsonPath = findUpSync('package.json', { cwd: startDir })
  packageJsonPathCacheSet(startDir, packageJsonPath)
  return packageJsonPath
}

/**
 * Read and parse package.json with caching. Results are cached to avoid
 * repeated file reads.
 *
 * @private
 *
 * @param packageJsonPath - Path to package.json.
 *
 * @returns Parsed package.json or null if invalid
 */
export function readPackageJson(packageJsonPath: string): object | undefined {
  const fs = getNodeFs()

  let mtimeMs = 0
  try {
    // oxlint-disable-next-line socket/prefer-exists-sync -- need mtimeMs for cache invalidation, not just existence.
    mtimeMs = fs.statSync(packageJsonPath).mtimeMs
  } catch {
    packageJsonContentCache.delete(packageJsonPath)
    return undefined
  }

  const cached = packageJsonContentCache.get(packageJsonPath)
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.content
  }

  try {
    const content = JSONParse(fs.readFileSync(packageJsonPath, 'utf8'))
    packageJsonContentCache.set(packageJsonPath, { mtimeMs, content })
    return content
  } catch {
    packageJsonContentCache.set(packageJsonPath, {
      mtimeMs,
      content: undefined,
    })
    return undefined
  }
}

/**
 * Detect executable type for paths in DLX cache. Uses filesystem structure
 * (node_modules/ presence).
 *
 * @example
 *   ;```typescript
 *   const result = detectDlxExecutableType('/tmp/.socket/_dlx/a1b2c3d4/tool')
 *   console.log(result.type) // 'package' or 'binary'
 *   ```
 *
 * @param filePath - Path within DLX cache (~/.socket/_dlx/)
 *
 * @returns Detection result
 */
export function detectDlxExecutableType(
  filePath: string,
): ExecutableDetectionResult {
  const fs = getNodeFs()
  const path = getNodePath()

  const dlxDir = getSocketDlxDir()
  const absolutePath = path.resolve(filePath)
  const relativePath = path.relative(dlxDir, absolutePath)
  const cacheKey = relativePath.split(path.sep)[0] ?? ''
  const cacheDir = path.join(dlxDir, cacheKey)

  // Packages have node_modules/, binaries don't.
  if (fs.existsSync(path.join(cacheDir, 'node_modules'))) {
    return {
      type: 'package',
      method: 'dlx-cache',
      inDlxCache: true,
    }
  }

  return {
    type: 'binary',
    method: 'dlx-cache',
    inDlxCache: true,
  }
}

/**
 * Detect if a path is a Node.js package or native binary executable. Works for
 * both DLX cache paths and local filesystem paths.
 *
 * Detection strategy: 1. If in DLX cache: Use detectDlxExecutableType() 2.
 * Otherwise: Use detectLocalExecutableType()
 *
 * @example
 *   ;```typescript
 *   const result = detectExecutableType('/path/to/tool')
 *   if (result.type === 'package') {
 *     spawnNode([filePath, ...args])
 *   } else {
 *     spawn(filePath, args)
 *   }
 *   ```
 *
 * @param filePath - Path to executable (DLX cache or local filesystem)
 *
 * @returns Detection result with type, method, and metadata
 */
export function detectExecutableType(
  filePath: string,
): ExecutableDetectionResult {
  if (isInSocketDlx(filePath)) {
    return detectDlxExecutableType(filePath)
  }

  return detectLocalExecutableType(filePath)
}

/**
 * Detect executable type for local filesystem paths. Uses package.json and file
 * extension checks.
 *
 * @example
 *   ;```typescript
 *   const result = detectLocalExecutableType('/usr/local/bin/tool')
 *   if (result.type === 'package') {
 *     console.log('Node.js package at:', result.packageJsonPath)
 *   }
 *   ```
 *
 * @param filePath - Local filesystem path (not in DLX cache)
 *
 * @returns Detection result
 */
export function detectLocalExecutableType(
  filePath: string,
): ExecutableDetectionResult {
  // Check 1: Look for package.json with bin field.
  const packageJsonPath = findPackageJson(filePath)
  if (packageJsonPath !== undefined) {
    const packageJson = readPackageJson(packageJsonPath) as Record<
      string,
      unknown
    > | null
    // If it has a bin field, it's a Node.js package.
    if (packageJson?.['bin']) {
      return {
        type: 'package',
        method: 'package-json',
        packageJsonPath,
        inDlxCache: false,
      }
    }
  }

  // Check 2: File extension fallback.
  if (isJsFilePath(filePath)) {
    return {
      inDlxCache: false,
      method: 'file-extension',
      type: 'package',
    }
  }

  return {
    type: 'binary',
    method: 'file-extension',
    inDlxCache: false,
  }
}

/**
 * Check if a file path indicates a Node.js script.
 *
 * @example
 *   ;```typescript
 *   isJsFilePath('index.js') // true
 *   isJsFilePath('lib.mjs') // true
 *   isJsFilePath('tool.exe') // false
 *   ```
 *
 * @param filePath - Path to check.
 *
 * @returns True if file has .js, .mjs, or .cjs extension
 */
export function isJsFilePath(filePath: string): boolean {
  const path = getNodePath()
  const ext = path.extname(filePath).toLowerCase()
  return NODE_JS_EXTENSIONS.has(ext as '.js' | '.mjs' | '.cjs')
}

/**
 * Simplified helper: Is this a native binary executable?
 *
 * @example
 *   ;```typescript
 *   isNativeBinary('/usr/local/bin/tool') // true
 *   isNativeBinary('/tmp/project/index.js') // false
 *   ```
 *
 * @param filePath - Path to check.
 *
 * @returns True if detected as native binary (not Node.js package)
 */
export function isNativeBinary(filePath: string): boolean {
  return detectExecutableType(filePath).type === 'binary'
}

/**
 * Simplified helper: Is this a Node.js package?
 *
 * @example
 *   ;```typescript
 *   isNodePackage('/tmp/project/index.js') // true
 *   isNodePackage('/usr/local/bin/tool') // false
 *   ```
 *
 * @param filePath - Path to check.
 *
 * @returns True if detected as Node.js package
 */
export function isNodePackage(filePath: string): boolean {
  return detectExecutableType(filePath).type === 'package'
}
