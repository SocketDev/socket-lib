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

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('fs')
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
    _path = /*@__PURE__*/ require('path')
  }
  return _path as typeof import('node:path')
}

/**
 * Node.js script file extensions.
 */
const NODE_JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs'] as const)

export type ExecutableType = 'package' | 'binary' | 'unknown'

export interface ExecutableDetectionResult {
  type: ExecutableType
  method: 'dlx-cache' | 'package-json' | 'file-extension'
  packageJsonPath?: string
  inDlxCache?: boolean
}

/**
 * Find package.json in the directory containing the file or parent directories.
 *
 * @param filePath - Path to search from
 * @returns Path to package.json if found, undefined otherwise
 * @private
 */
function findPackageJson(filePath: string): string | undefined {
  const fs = getFs()
  const path = getPath()

  let currentDir = path.dirname(path.resolve(filePath))
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath
    }

    currentDir = path.dirname(currentDir)
  }

  return undefined
}

/**
 * Detect executable type for paths in DLX cache.
 * Uses filesystem structure (node_modules/ presence).
 *
 * @param filePath - Path within DLX cache (~/.socket/_dlx/)
 * @returns Detection result
 */
export function detectDlxExecutableType(
  filePath: string,
): ExecutableDetectionResult {
  const fs = getFs()
  const path = getPath()

  const dlxDir = getSocketDlxDir()
  const absolutePath = path.resolve(filePath)
  const relativePath = path.relative(dlxDir, absolutePath)
  const cacheKey = relativePath.split(path.sep)[0]
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
 */
export function detectLocalExecutableType(
  filePath: string,
): ExecutableDetectionResult {
  const fs = getFs()

  // Check 1: Look for package.json with bin field.
  const packageJsonPath = findPackageJson(filePath)
  if (packageJsonPath !== undefined) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      // If it has a bin field, it's a Node.js package.
      if (packageJson.bin) {
        return {
          type: 'package',
          method: 'package-json',
          packageJsonPath,
          inDlxCache: false,
        }
      }
    } catch {
      // Invalid package.json, fall through.
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
 */
export function isNativeBinary(filePath: string): boolean {
  return detectExecutableType(filePath).type === 'binary'
}

/**
 * Simplified helper: Is this a Node.js package?
 *
 * @param filePath - Path to check
 * @returns True if detected as Node.js package
 */
export function isNodePackage(filePath: string): boolean {
  return detectExecutableType(filePath).type === 'package'
}
