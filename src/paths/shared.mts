/**
 * @file Shared internals for the `paths/` module — the leaf-level primitives
 *   every other path leaf depends on. Kept as a single file so `normalize`,
 *   `predicates`, `conversion`, and `resolve` can layer above it without
 *   circular imports.
 *
 *   - char-code constants + shared regexps
 *   - `pathLikeToString` — `string | Buffer | URL` → `string`
 *   - `normalizePath` and its `msysDriveToNative` / `foldPathForCompare` helpers
 *     — they live at the leaf because `conversion` and `resolve` call
 *     `normalizePath` and `predicates` calls `foldPathForCompare`. Hosting them
 *     one layer up made `paths/normalize` import its own importers, and the
 *     built CJS barrel then snapshotted those re-exports as `undefined`.
 *     Nothing here may import a sibling `paths/*` leaf. That is the invariant
 *     `scripts/repo/check/reexports-have-no-import-cycles.mts` enforces.
 */

import { isWin32 } from '../constants/platform.mjs'
import { getNodeUrl } from '../node/url.mjs'

import { BufferIsBuffer } from '../primordials/buffer.mjs'

import {
  StringPrototypeCharAt,
  StringPrototypeCharCodeAt,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials/string.mjs'

// Char-code constants are owned by `constants/encoding`, the single source.
// They are re-exported here so `paths/*` keeps its local import site
// unchanged.
export {
  CHAR_BACKWARD_SLASH,
  CHAR_COLON,
  CHAR_FORWARD_SLASH,
  CHAR_LOWERCASE_A,
  CHAR_LOWERCASE_Z,
  CHAR_UPPERCASE_A,
  CHAR_UPPERCASE_Z,
} from '../constants/encoding.mjs'

// A normalized path that is exactly a bare Windows drive letter (`C:`).
const DRIVE_LETTER_REGEXP = /^[A-Za-z]:$/

// Captures the drive letter (group 1) and the trailing separator if any
// (group 2). The replace callback in msysDriveToNative below
// reads both — non-capturing groups would leave `letter` undefined and
// `.toUpperCase()` would throw on Windows MSYS-style paths like `/c/foo`.
// oxlint-disable-next-line socket/prefer-non-capturing-group -- both groups are read by the replace callback in msysDriveToNative below
export const msysDriveRegExp = /^\/([a-zA-Z])($|\/)/
// Matches a `node_modules` path segment: bounded by a slash of either
// separator or string start before, and a slash or string end after — so it
// hits `node_modules` as a whole segment, not a substring like
// `my_node_modules`.
export const nodeModulesPathRegExp = /(?:[/\\]|^)node_modules(?:$|[/\\])/
export const slashRegExp = /[/\\]/

export function appendNormalizedPathSegment(
  state: NormalizedPathState,
  segment: string,
  prefix: string,
): void {
  if (segment.length === 0 || segment === '.') {
    return
  }
  if (segment === '..') {
    collapsePathParent(state, prefix)
  } else {
    state.collapsed += (state.collapsed.length === 0 ? '' : '/') + segment
    state.segmentCount += 1
  }
}

export interface NormalizedPathState {
  collapsed: string
  segmentCount: number
  leadingDotDots: number
}

export function collapsePathParent(
  state: NormalizedPathState,
  prefix: string,
): void {
  if (state.segmentCount > 0) {
    const lastSeparatorIndex = state.collapsed.lastIndexOf('/')
    if (lastSeparatorIndex === -1) {
      state.collapsed = ''
      state.segmentCount = 0
      if (state.leadingDotDots > 0 && !prefix) {
        state.collapsed = '..'
        state.leadingDotDots = 1
      }
    } else {
      const lastSegmentStart = lastSeparatorIndex + 1
      const lastSegmentValue = state.collapsed.slice(lastSegmentStart)
      if (lastSegmentValue === '..') {
        state.collapsed = `${state.collapsed}/..`
        state.leadingDotDots += 1
      } else {
        state.collapsed = state.collapsed.slice(0, lastSeparatorIndex)
        state.segmentCount -= 1
      }
    }
  } else if (!prefix) {
    state.collapsed =
      state.collapsed + (state.collapsed.length === 0 ? '' : '/') + '..'
    state.leadingDotDots += 1
  }
}

/**
 * Normalize a path for equality comparison — forward slashes, no trailing
 * separator, lowercased on Windows.
 *
 * @example
 *   ;```typescript
 *   foldPathForCompare('C:\\Program Files\\') // 'c:/program files'
 *   ```
 */
export function foldPathForCompare(pathLike: string): string {
  let normalized = normalizePath(pathLike)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return isWin32() ? normalized.toLowerCase() : normalized
}

export function hasUncPathPrefix(filepath: string): boolean {
  const first = StringPrototypeCharCodeAt(filepath, 0)
  return (
    filepath.length > 2 &&
    isPathSeparatorCode(first) &&
    StringPrototypeCharCodeAt(filepath, 1) === first &&
    StringPrototypeCharCodeAt(filepath, 2) !== first
  )
}

export function hasUncPathShare(filepath: string): boolean {
  const serverStart = skipPathSeparators(filepath, 2)
  const serverEnd = indexOfPathSeparator(filepath, serverStart)
  return (
    serverEnd > 2 && skipPathSeparators(filepath, serverEnd) < filepath.length
  )
}

/**
 * Find the next path separator at or after an index.
 *
 * Scans char codes for `/` (47) and `\` (92) — the same two characters
 * `slashRegExp` matches — and allocates nothing. Reaching the same answer
 * through `search` costs a substring, an options bag, and a regex match per
 * lookup, which a segment walk pays once per segment.
 *
 * @example
 *   ;```typescript
 *   indexOfPathSeparator('a/b', 0) // 1
 *   indexOfPathSeparator('a/b', 2) // -1
 *   indexOfPathSeparator('a\\b', 0) // 1
 *   ```
 *
 * @param {string} filepath - The path to scan.
 * @param {number} fromIndex - The index to start scanning at.
 *
 * @returns {number} The index of the first separator at or after `fromIndex`,
 *   or -1 when there is none.
 */
export function indexOfPathSeparator(
  filepath: string,
  fromIndex: number,
): number {
  const { length } = filepath
  for (let i = fromIndex; i < length; i += 1) {
    const code = StringPrototypeCharCodeAt(filepath, i)
    if (code === 47 /*'/'*/ || code === 92 /*'\\'*/) {
      return i
    }
  }
  return -1
}

export function isPathSeparatorCode(code: number): boolean {
  return code === 47 || code === 92
}

// On Windows, convert MSYS drive notation to native: /c/path → C:/path
export function msysDriveToNative(normalized: string): string {
  /* c8 ignore start - Windows-only branch. */
  if (isWin32()) {
    return normalized.replace(
      msysDriveRegExp,
      (_, letter, sep) => `${letter.toUpperCase()}:${sep || '/'}`,
    )
  }
  /* c8 ignore stop */
  return normalized
}

export function normalizedPathPrefix(filepath: string) {
  const namespaceKind = StringPrototypeCharCodeAt(filepath, 2)
  if (
    filepath.length > 4 &&
    StringPrototypeCharCodeAt(filepath, 3) === 92 &&
    (namespaceKind === 63 || namespaceKind === 46) &&
    StringPrototypeCharCodeAt(filepath, 0) === 92 &&
    StringPrototypeCharCodeAt(filepath, 1) === 92
  ) {
    return { __proto__: null, prefix: '//', start: 2 }
  }
  if (hasUncPathPrefix(filepath) && hasUncPathShare(filepath)) {
    return { __proto__: null, prefix: '//', start: 2 }
  }
  const start = skipPathSeparators(filepath, 0)
  return { __proto__: null, prefix: start ? '/' : '', start }
}

/**
 * Normalize a path by converting backslashes to forward slashes and collapsing
 * segments.
 *
 * - Converts all backslashes (`\`) to forward slashes (`/`)
 * - Collapses repeated slashes
 * - Resolves `.` and `..` segments
 * - Preserves UNC path prefixes (`//server/share`)
 * - Preserves Windows namespace prefixes (`//./`, `//?/`)
 * - Returns `.` for empty or collapsed paths
 * - On Windows: MSYS drive letters `/c/path` become `C:/path`
 *
 * @example
 *   ;```typescript
 *   normalizePath('foo/bar//baz') // 'foo/bar/baz'
 *   normalizePath('foo/./bar') // 'foo/bar'
 *   normalizePath('foo/bar/../baz') // 'foo/baz'
 *   normalizePath('C:\\Users\\u\\file.txt') // 'C:/Users/u/file.txt'
 *   normalizePath('\\\\server\\share\\file') // '//server/share/file'
 *   normalizePath('') // '.'
 *   ```
 *
 * @param {string | Buffer | URL} pathLike - The path to normalize.
 *
 * @returns {string} The normalized path
 *
 * @security
 * **WARNING**: This function resolves `..` patterns as part of normalization, which means
 * paths like `/../etc/passwd` become `/etc/passwd`. When processing untrusted user input
 * (HTTP requests, file uploads, URL parameters), you MUST validate for path traversal
 * attacks BEFORE calling this function.
 */
export function normalizePath(pathLike: string | Buffer | URL): string {
  const filepath = pathLikeToString(pathLike)
  const { length } = filepath
  if (length === 0) {
    return '.'
  }
  if (length === 1) {
    return StringPrototypeCharCodeAt(filepath, 0) === 92 ? '/' : filepath
  }
  const initial = normalizedPathPrefix(filepath)
  const { prefix } = initial
  let { start } = initial
  let nextIndex = indexOfPathSeparator(filepath, start)
  if (nextIndex === -1) {
    return normalizeSinglePathSegment(filepath.slice(start), prefix)
  }
  const state: NormalizedPathState = {
    collapsed: '',
    segmentCount: 0,
    leadingDotDots: 0,
  }
  while (nextIndex !== -1) {
    appendNormalizedPathSegment(state, filepath.slice(start, nextIndex), prefix)
    start = skipPathSeparators(filepath, nextIndex + 1)
    nextIndex = indexOfPathSeparator(filepath, start)
  }
  appendNormalizedPathSegment(state, filepath.slice(start), prefix)
  const { collapsed } = state
  if (collapsed.length === 0) {
    return prefix || '.'
  }
  // A drive root keeps its slash; a bare drive denotes its current directory.
  if (
    DRIVE_LETTER_REGEXP.test(collapsed) &&
    isPathSeparatorCode(StringPrototypeCharCodeAt(filepath, 2))
  ) {
    return msysDriveToNative(`${prefix}${collapsed}/`)
  }
  return msysDriveToNative(prefix + collapsed)
}

export function normalizeSinglePathSegment(
  segment: string,
  prefix: string,
): string {
  if (segment === '.' || segment.length === 0) {
    return prefix || '.'
  }
  if (segment === '..') {
    return prefix ? StringPrototypeSlice(prefix, 0, -1) || '/' : '..'
  }
  return msysDriveToNative(prefix + segment)
}

/**
 * Convert a path-like value to a string.
 *
 * Converts various path-like types (string, Buffer, URL) into a normalized
 * string representation. Handles different input formats and provides
 * consistent string output for path operations.
 *
 * @example
 *   ;```typescript
 *   pathLikeToString('/home/user') // '/home/user'
 *   pathLikeToString(Buffer.from('/tmp/file')) // '/tmp/file'
 *   pathLikeToString(new URL('file:///home/user')) // '/home/user'
 *   pathLikeToString(null) // ''
 *   ```
 *
 * @param {string | Buffer | URL | null | undefined} pathLike - The value to
 *   convert.
 *
 * @returns {string} The string representation, or empty string for
 *   null/undefined.
 */
export function pathLikeToString(
  pathLike: string | Buffer | URL | null | undefined,
): string {
  if (pathLike === null || pathLike === undefined) {
    return ''
  }
  if (typeof pathLike === 'string') {
    return pathLike
  }
  if (BufferIsBuffer!(pathLike)) {
    return pathLike.toString('utf8')
  }
  const url = getNodeUrl()
  if (pathLike instanceof URL) {
    try {
      return url.fileURLToPath(pathLike)
    } catch {
      // On Windows, file URLs like `file:///C:/path` include drive letters.
      // Missing-drive-letter URLs throw; this fallback extracts the
      // pathname directly and decodes percent-encoding.
      const pathname = pathLike.pathname

      const decodedPathname = decodeURIComponent(pathname)

      /* c8 ignore start - Windows-only URL drive-letter handling. */
      if (isWin32() && StringPrototypeStartsWith(decodedPathname, '/')) {
        // Drive-letter pattern: /[a-zA-Z]:/
        const letter = StringPrototypeCharCodeAt(decodedPathname, 1) | 0x20
        const hasValidDriveLetter =
          decodedPathname.length >= 3 &&
          letter >= 97 &&
          letter <= 122 &&
          StringPrototypeCharAt(decodedPathname, 2) === ':'

        if (!hasValidDriveLetter) {
          // Preserve Unix-style absolute paths on Windows when the URL
          // didn't carry a drive letter.
          return decodedPathname
        }
      }
      /* c8 ignore stop */
      return decodedPathname
    }
  }
  return String(pathLike)
}

export function skipPathSeparators(filepath: string, start: number): number {
  while (isPathSeparatorCode(StringPrototypeCharCodeAt(filepath, start))) {
    start += 1
  }
  return start
}
