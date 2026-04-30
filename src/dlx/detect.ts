/**
 * @fileoverview Executable type detection for DLX and local filesystem paths.
 *
 * Provides utilities to detect whether a path is a Node.js package or native
 * binary executable. Supports both DLX cache paths and local filesystem paths.
 *
 * Key Functions:
 * - detectExecutableType: Generic entry point for any path
 * - detectDlxExecutableType: DLX cache specific detection
 * - detectLocalExecutableType: Local filesystem specific detection
 *
 * Detection Strategies:
 * - DLX cache: Check for node_modules/ directory
 * - Local paths: Check for package.json with bin field, then file extension
 */

import { isInSocketDlx } from './paths'
import { getSocketDlxDir } from '../paths/socket'

import { DateNow, JSONParse, MapCtor, SetCtor } from '../primordials'

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

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
  path: string | null
  at: number
}
const packageJsonPathCache = new MapCtor<string, PackageJsonPathEntry>()

function packageJsonPathCacheSet(key: string, value: string | null): void {
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
  content: object | null
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
 * @param filePath - Path to search from
 * @returns Path to package.json if found, undefined otherwise
 * @private
 */
function findPackageJson(filePath: string): string | undefined {
  const fs = getFs()
  const path = getPath()

  const startDir = path.dirname(path.resolve(filePath))

  // Check cache first.
  const cached = packageJsonPathCache.get(startDir)
  if (cached !== undefined) {
    // Negative entries expire after a short TTL so a directory that later
    // gains a package.json (npm install in a sibling workspace, etc.) is
    // re-probed instead of permanently stuck on the cached "not found".
    if (cached.path === null) {
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

  let currentDir = startDir
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      // Cache the result for the starting directory.
      packageJsonPathCacheSet(startDir, packageJsonPath)
      return packageJsonPath
    }

    currentDir = path.dirname(currentDir)
  }

  // Cache the negative result.
  packageJsonPathCacheSet(startDir, null)
  return undefined
}

/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Read and parse package.json with caching.
 * Results are cached to avoid repeated file reads.
 *
 * @param packageJsonPath - Path to package.json
 * @returns Parsed package.json or null if invalid
 * @private
 */
function readPackageJson(packageJsonPath: string): object | null {
  const fs = getFs()

  let mtimeMs = 0
  try {
    mtimeMs = fs.statSync(packageJsonPath).mtimeMs
  } catch {
    packageJsonContentCache.delete(packageJsonPath)
    return null
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
    packageJsonContentCache.set(packageJsonPath, { mtimeMs, content: null })
    return null
  }
}

/**
 * Detect executable type for paths in DLX cache.
 * Uses filesystem structure (node_modules/ presence).
 *
 * @param filePath - Path within DLX cache (~/.socket/_dlx/)
 * @returns Detection result
 *
 * @example
 * ```typescript
 * const result = detectDlxExecutableType('/tmp/.socket/_dlx/a1b2c3d4/tool')
 * console.log(result.type) // 'package' or 'binary'
 * ```
 */
export function detectDlxExecutableType(
  filePath: string,
): ExecutableDetectionResult {
  const fs = getFs()
  const path = getPath()

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
 * Detect if a path is a Node.js package or native binary executable.
 * Works for both DLX cache paths and local filesystem paths.
 *
 * Detection strategy:
 * 1. If in DLX cache: Use detectDlxExecutableType()
 * 2. Otherwise: Use detectLocalExecutableType()
 *
 * @param filePath - Path to executable (DLX cache or local filesystem)
 * @returns Detection result with type, method, and metadata
 *
 * @example
 * ```typescript
 * const result = detectExecutableType('/path/to/tool')
 * if (result.type === 'package') {
 *   spawnNode([filePath, ...args])
 * } else {
 *   spawn(filePath, args)
 * }
 * ```
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
 * Detect executable type for local filesystem paths.
 * Uses package.json and file extension checks.
 *
 * @param filePath - Local filesystem path (not in DLX cache)
 * @returns Detection result
 *
 * @example
 * ```typescript
 * const result = detectLocalExecutableType('/usr/local/bin/tool')
 * if (result.type === 'package') {
 *   console.log('Node.js package at:', result.packageJsonPath)
 * }
 * ```
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
 * @param filePath - Path to check
 * @returns True if file has .js, .mjs, or .cjs extension
 *
 * @example
 * ```typescript
 * isJsFilePath('index.js')   // true
 * isJsFilePath('lib.mjs')    // true
 * isJsFilePath('tool.exe')   // false
 * ```
 */
export function isJsFilePath(filePath: string): boolean {
  const path = getPath()
  const ext = path.extname(filePath).toLowerCase()
  return NODE_JS_EXTENSIONS.has(ext as '.js' | '.mjs' | '.cjs')
}

/**
 * Simplified helper: Is this a native binary executable?
 *
 * @param filePath - Path to check
 * @returns True if detected as native binary (not Node.js package)
 *
 * @example
 * ```typescript
 * isNativeBinary('/usr/local/bin/tool')    // true
 * isNativeBinary('/tmp/project/index.js')  // false
 * ```
 */
export function isNativeBinary(filePath: string): boolean {
  return detectExecutableType(filePath).type === 'binary'
}

/**
 * Simplified helper: Is this a Node.js package?
 *
 * @param filePath - Path to check
 * @returns True if detected as Node.js package
 *
 * @example
 * ```typescript
 * isNodePackage('/tmp/project/index.js')   // true
 * isNodePackage('/usr/local/bin/tool')     // false
 * ```
 */
export function isNodePackage(filePath: string): boolean {
  return detectExecutableType(filePath).type === 'package'
}
