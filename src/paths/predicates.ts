/**
 * @file Path predicates — `is*` checks for path shape and kind. Split out of
 *   `paths/normalize.ts` for file-size hygiene. Pure boolean predicates over
 *   paths and character codes.
 *
 *   - `isAbsolute`, `isRelative` — root-anchoring shape
 *   - `isPath` — file-path vs package-spec vs URL discriminator
 *   - `isNodeModules`, `isUnixPath` — content-pattern checks
 *   - `isPathSeparator`, `isWindowsDeviceRoot` — char-code primitives
 */

import { WIN32 } from '../constants/platform'

import { RegExpPrototypeTest } from '../primordials/regexp'

import {
  StringPrototypeCharCodeAt,
  StringPrototypeStartsWith,
} from '../primordials/string'

import {
  CHAR_BACKWARD_SLASH,
  CHAR_COLON,
  CHAR_FORWARD_SLASH,
  CHAR_LOWERCASE_A,
  CHAR_LOWERCASE_Z,
  CHAR_UPPERCASE_A,
  CHAR_UPPERCASE_Z,
  msysDriveRegExp,
  nodeModulesPathRegExp,
  pathLikeToString,
} from './_internal'

/**
 * Check if a path is absolute.
 *
 * Handles both POSIX (`/...`) and Windows (drive-letter, UNC, device) absolute
 * path shapes.
 *
 * @example
 *   ;```typescript
 *   isAbsolute('/home/user') // true
 *   isAbsolute('C:\\Windows') // true on Windows
 *   isAbsolute('../relative') // false
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The path to check.
 *
 * @returns {boolean} `true` if absolute, `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export function isAbsolute(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  const { length } = filepath

  if (length === 0) {
    return false
  }

  const code = StringPrototypeCharCodeAt(filepath, 0)

  // POSIX: '/' at start.
  if (code === CHAR_FORWARD_SLASH) {
    return true
  }

  // Windows: '\' at start (UNC + device + drive-relative).
  if (code === CHAR_BACKWARD_SLASH) {
    return true
  }

  /* c8 ignore start - Windows drive-letter detection. */
  // Windows drive-letter absolute paths: [A-Za-z]:[\\/]
  if (WIN32 && length > 2) {
    if (
      isWindowsDeviceRoot(code) &&
      StringPrototypeCharCodeAt(filepath, 1) === CHAR_COLON &&
      isPathSeparator(StringPrototypeCharCodeAt(filepath, 2))
    ) {
      return true
    }
  }
  /* c8 ignore stop */

  return false
}

/**
 * Check if a path contains a `node_modules` directory segment.
 *
 * Matches `node_modules` only as a complete path segment.
 *
 * @example
 *   ;```typescript
 *   isNodeModules('/project/node_modules/package') // true
 *   isNodeModules('/src/my_node_modules_backup') // false
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The path to check.
 *
 * @returns {boolean} `true` if the path contains `node_modules`
 */
/*@__NO_SIDE_EFFECTS__*/
export function isNodeModules(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  return RegExpPrototypeTest(nodeModulesPathRegExp, filepath)
}

/**
 * Check if a value is a valid file path (absolute or relative).
 *
 * Distinguishes between file paths and other string formats like package names,
 * URLs, or bare module specifiers.
 *
 * @example
 *   ;```typescript
 *   isPath('/absolute/path') // true
 *   isPath('./relative/path') // true
 *   isPath('@scope/name/subpath') // true
 *   isPath('lodash') // false
 *   isPath('http://example.com') // false
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The value to check.
 *
 * @returns {boolean} `true` if the value is a valid file path
 */
/*@__NO_SIDE_EFFECTS__*/
export function isPath(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  if (typeof filepath !== 'string' || filepath.length === 0) {
    return false
  }

  // Exclude URLs with protocols (file:, http:, https:, git:, etc.). Two-char
  // scheme prefix excludes Windows drive letters (C:, D:).
  if (/^[a-z][a-z0-9+.-]+:/i.test(filepath)) {
    return false
  }

  // Special relative paths.
  if (filepath === '.' || filepath === '..') {
    return true
  }

  if (isAbsolute(filepath)) {
    return true
  }

  if (filepath.includes('/') || filepath.includes('\\')) {
    // Distinguish scoped package names from paths starting with '@'.
    // Scoped packages: @scope/name (exactly 2 parts, no backslashes).
    // Paths: @scope/name/subpath (3+ parts) or @scope\name (Windows).
    if (
      StringPrototypeStartsWith(filepath, '@') &&
      !StringPrototypeStartsWith(filepath, '@/')
    ) {
      const parts = filepath.split('/')
      if (parts.length <= 2 && !parts[1]?.includes('\\')) {
        return false
      }
    }
    return true
  }

  // Bare names without separators are package names.
  return false
}

/**
 * Check if a character code is a path separator (`/` or `\`).
 *
 * @example
 *   ;```typescript
 *   isPathSeparator(47) // true — '/'
 *   isPathSeparator(92) // true — '\'
 *   isPathSeparator(65) // false — 'A'
 *   ```
 *
 * @param {number} code - The character code to check.
 *
 * @returns {boolean} `true` if separator
 */
/*@__NO_SIDE_EFFECTS__*/
export function isPathSeparator(code: number): boolean {
  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH
}

/**
 * Check if a path is relative (i.e., not absolute).
 *
 * Empty strings are treated as relative.
 *
 * @example
 *   ;```typescript
 *   isRelative('./src/index.js') // true
 *   isRelative('src/file.js') // true
 *   isRelative('/home/user') // false
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The path to check.
 *
 * @returns {boolean} `true` if the path is relative
 */
/*@__NO_SIDE_EFFECTS__*/
export function isRelative(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  /* c8 ignore start */
  if (typeof filepath !== 'string') {
    return false
  }
  /* c8 ignore stop */
  if (filepath.length === 0) {
    return true
  }
  return !isAbsolute(filepath)
}

/**
 * Check if a path uses MSYS/Git Bash Unix-style drive letter notation.
 *
 * Detects paths in the format `/c/...` where a single letter after the leading
 * slash represents a Windows drive letter.
 *
 * @example
 *   ;```typescript
 *   isUnixPath('/c/tools/bin') // true
 *   isUnixPath('/tmp/build') // false
 *   isUnixPath('C:/Windows') // false
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The path to check.
 *
 * @returns {boolean} `true` if the path uses MSYS drive letter notation
 */
/*@__NO_SIDE_EFFECTS__*/
export function isUnixPath(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  return (
    typeof filepath === 'string' &&
    RegExpPrototypeTest(msysDriveRegExp, filepath)
  )
}

/**
 * Check if a character code is a Windows device root letter (A-Z / a-z).
 *
 * @example
 *   ;```typescript
 *   isWindowsDeviceRoot(67) // true  — 'C'
 *   isWindowsDeviceRoot(99) // true  — 'c'
 *   isWindowsDeviceRoot(58) // false — ':'
 *   ```
 *
 * @param {number} code - The character code to check.
 *
 * @returns {boolean} `true` if valid drive-letter code
 */
/* c8 ignore start - Only called from Windows-only branches. */
/*@__NO_SIDE_EFFECTS__*/
export function isWindowsDeviceRoot(code: number): boolean {
  return (
    (code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z) ||
    (code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z)
  )
}
/* c8 ignore stop */
