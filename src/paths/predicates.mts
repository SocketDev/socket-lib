/**
 * @file Path predicates — `is*` checks for path shape and kind. Split out of
 *   `paths/normalize.ts` for file-size hygiene. Pure boolean predicates over
 *   paths and character codes.
 *
 *   - `isAbsolute`, `isRelative` — root-anchoring shape
 *   - `isPath` — file-path vs package-spec vs URL discriminator
 *   - `isNodeModules`, `isUnixPath` — content-pattern checks
 *   - `isPathSeparator`, `isWindowsDeviceRoot` — char-code primitives
 *   - `isPathWithinRoot` — realpath containment check
 */

import { isWin32 } from '../constants/platform.mjs'

import { RegExpPrototypeTest } from '../primordials/regexp.mjs'

import {
  StringPrototypeCharCodeAt,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials/string.mjs'

import {
  CHAR_BACKWARD_SLASH,
  CHAR_COLON,
  CHAR_FORWARD_SLASH,
  CHAR_LOWERCASE_A,
  CHAR_LOWERCASE_Z,
  CHAR_UPPERCASE_A,
  CHAR_UPPERCASE_Z,
  foldPathForCompare,
  msysDriveRegExp,
  nodeModulesPathRegExp,
  pathLikeToString,
} from './shared.mjs'

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
  if (isWin32() && length > 2) {
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
export function isNodeModules(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  return RegExpPrototypeTest(nodeModulesPathRegExp, filepath)
}

/**
 * Check if a value is a valid absolute or relative file path.
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

  // oxlint-disable-next-line socket/paths-are-normalized-before-match-at-edit -- classifier inspects RAW separators by design; normalizing would erase the backslash signal branched on below.
  if (filepath.includes('/') || filepath.includes('\\')) {
    // Distinguish scoped package names from paths starting with '@'.
    // Scoped packages: @scope/name (exactly 2 parts, no backslashes).
    // Paths: @scope/name/subpath (3+ parts) or @scope\name (Windows).
    if (
      StringPrototypeStartsWith(filepath, '@') &&
      !StringPrototypeStartsWith(filepath, '@/')
    ) {
      // oxlint-disable-next-line socket/paths-are-normalized-before-match-at-edit -- raw input intentionally split; a backslash here means Windows path, not scoped package.
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
export function isPathSeparator(code: number): boolean {
  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH
}

/**
 * Report whether a path sits at or under a root. Both sides must already be
 * realpath'd.
 *
 * @example
 *   ;```typescript
 *   isPathWithinRoot('/repo/bin/git', '/repo') // true
 *   isPathWithinRoot('/usr/bin/git', '/repo') // false
 *   ```
 */
export function isPathWithinRoot(candidate: string, root: string): boolean {
  const left = foldPathForCompare(candidate)
  const right = foldPathForCompare(root)
  return left === right || left.startsWith(`${right}/`)
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
 * Check if a value is wrapped in path separators on BOTH ends — the
 * `/wrapped/` sigil some list formats use to mark a substring (not exact)
 * entry. Either separator direction counts on either end, so a stray
 * backslash-wrapped entry is still read as the sigil rather than silently
 * treated as an exact path.
 *
 * @example
 *   ;```typescript
 *   isSeparatorWrapped('/rendering-chromium-to-png/') // true
 *   isSeparatorWrapped('\\rendering-chromium-to-png\\') // true
 *   isSeparatorWrapped('scripts/fleet/acquire.mts') // false
 *   isSeparatorWrapped('//') // false
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The value to check.
 *
 * @returns {boolean} `true` if both ends are path separators with content
 *   between.
 */
export function isSeparatorWrapped(pathLike: string | Buffer | URL): boolean {
  const filepath = pathLikeToString(pathLike)
  const { length } = filepath
  if (length < 3) {
    return false
  }
  return (
    isPathSeparator(StringPrototypeCharCodeAt(filepath, 0)) &&
    isPathSeparator(StringPrototypeCharCodeAt(filepath, length - 1))
  )
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
export function isWindowsDeviceRoot(code: number): boolean {
  return (
    (code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z) ||
    (code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z)
  )
}
/* c8 ignore stop */

/**
 * The forward-slash substring form of a separator-wrapped entry, or
 * undefined when the value is not wrapped. The inner segment's backslashes
 * become forward slashes so the needle matches against normalized paths.
 *
 * @example
 *   ;```typescript
 *   separatorWrappedSubstring('/rendering-chromium-to-png/') // '/rendering-chromium-to-png/'
 *   separatorWrappedSubstring('\\rendering-chromium-to-png\\') // '/rendering-chromium-to-png/'
 *   separatorWrappedSubstring('scripts/fleet/acquire.mts') // undefined
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The value to convert.
 *
 * @returns {string | undefined} The `/inner/` substring form, or undefined
 */
export function separatorWrappedSubstring(
  pathLike: string | Buffer | URL,
): string | undefined {
  if (!isSeparatorWrapped(pathLike)) {
    return undefined
  }
  const filepath = pathLikeToString(pathLike)
  const inner = StringPrototypeSlice(filepath, 1, -1).replaceAll('\\', '/')
  return `/${inner}/`
}
