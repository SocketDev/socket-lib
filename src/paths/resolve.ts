/**
 * @fileoverview Path resolution utilities — `resolve`, `relative`,
 * `relativeResolve`. Split out of `paths/normalize.ts` for size hygiene.
 *
 *   - `resolve` — Node-style `path.resolve()` over absolute-path semantics
 *   - `relative` — relative path from one absolute to another
 *   - `relativeResolve` — `relative` + `normalizePath` convenience wrapper
 */

import { WIN32 } from '../constants/platform'

import { StringPrototypeCharCodeAt } from '../primordials/string'

import { CHAR_UPPERCASE_A, CHAR_UPPERCASE_Z } from './_internal'
import { normalizePath } from './normalize'
import { isAbsolute, isPathSeparator } from './predicates'

/**
 * Calculate the relative path from one path to another.
 *
 * Both inputs are resolved to absolute paths first, then compared to find the
 * longest common base, and finally a relative path is constructed using
 * `../` for parent-directory traversal.
 *
 * Windows file systems are case-insensitive; the comparison reflects that.
 *
 * @param {string} from - Source path
 * @param {string} to - Destination path
 * @returns {string} Relative path from `from` to `to`, or empty string if equal
 *
 * @example
 * ```typescript
 * relative('/foo/bar', '/foo/baz')           // '../baz'
 * relative('/foo/bar/baz', '/foo')           // '../..'
 * relative('/foo', '/foo/bar')               // 'bar'
 * relative('/foo/bar', '/foo/bar')           // ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function relative(from: string, to: string): string {
  // Quick return if paths are already identical.
  if (from === to) {
    return ''
  }

  // Resolve both paths to absolute.
  const actualFrom = resolve(from)
  const actualTo = resolve(to)

  // Check again after resolution.
  if (actualFrom === actualTo) {
    return ''
  }

  /* c8 ignore start - Windows-only case-insensitive comparison. */
  // Windows: NTFS / FAT32 preserve case but are case-insensitive for lookups.
  if (WIN32) {
    const fromLower = actualFrom.toLowerCase()
    const toLower = actualTo.toLowerCase()
    if (fromLower === toLower) {
      return ''
    }
  }
  /* c8 ignore stop */

  // Skip the leading separator for comparison.
  const fromStart = 1
  const fromEnd = actualFrom.length
  const fromLen = fromEnd - fromStart
  const toStart = 1
  const toEnd = actualTo.length
  const toLen = toEnd - toStart

  // Compare paths char-by-char to find the longest common prefix.
  const length = fromLen < toLen ? fromLen : toLen
  let lastCommonSep = -1
  let i = 0

  for (; i < length; i += 1) {
    let fromCode = StringPrototypeCharCodeAt(actualFrom, fromStart + i)
    let toCode = StringPrototypeCharCodeAt(actualTo, toStart + i)

    /* c8 ignore start - Windows-only case folding. */
    if (WIN32) {
      if (fromCode >= CHAR_UPPERCASE_A && fromCode <= CHAR_UPPERCASE_Z) {
        fromCode += 32
      }
      if (toCode >= CHAR_UPPERCASE_A && toCode <= CHAR_UPPERCASE_Z) {
        toCode += 32
      }
    }
    /* c8 ignore stop */

    if (fromCode !== toCode) {
      break
    }

    // Use the original (unfolded) code from actualFrom to detect separators.
    if (isPathSeparator(StringPrototypeCharCodeAt(actualFrom, fromStart + i))) {
      lastCommonSep = i
    }
  }

  // Edge cases where one path is a prefix of the other.
  /* c8 ignore start */
  if (i === length) {
    if (toLen > length) {
      const toCode = StringPrototypeCharCodeAt(actualTo, toStart + i)
      if (isPathSeparator(toCode)) {
        return actualTo.slice(toStart + i + 1)
      }
      if (i === 0) {
        return actualTo.slice(toStart + i)
      }
    } else if (fromLen > length) {
      const fromCode = StringPrototypeCharCodeAt(actualFrom, fromStart + i)
      if (isPathSeparator(fromCode)) {
        lastCommonSep = i
      } else if (i === 0) {
        lastCommonSep = 0
      }
    }
  }
  /* c8 ignore stop */

  // Generate '../' segments for each directory in `from` after the common base.
  let out = ''
  for (i = fromStart + lastCommonSep + 1; i <= fromEnd; i += 1) {
    const code = StringPrototypeCharCodeAt(actualFrom, i)
    if (i === fromEnd || isPathSeparator(code)) {
      out += out.length === 0 ? '..' : '/..'
    }
  }

  return out + actualTo.slice(toStart + lastCommonSep)
}

/**
 * Get the normalized relative path from one path to another.
 *
 * Computes the relative path using `relative()` then runs the result through
 * `normalizePath()`. Empty strings (same path) are preserved verbatim rather
 * than collapsed to `.`.
 *
 * @param {string} from - Source path
 * @param {string} to - Destination path
 * @returns {string} Normalized relative path, or empty string if equal
 *
 * @example
 * ```typescript
 * relativeResolve('/foo/bar', '/foo/baz')         // '../baz'
 * relativeResolve('/foo/bar', '/foo/bar')         // ''
 * relativeResolve('/foo/./bar', '/foo/baz')       // '../baz'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function relativeResolve(from: string, to: string): string {
  const rel = relative(from, to)
  // Empty string means same path — don't normalize to '.'.
  if (rel === '') {
    return ''
  }
  return normalizePath(rel)
}

/**
 * Resolve an absolute path from path segments.
 *
 * Mimics Node.js `path.resolve()`: processes segments right-to-left, stops at
 * the first absolute segment, and prepends the cwd if no absolute segment is
 * found. The final path is normalized.
 *
 * @param {...string} segments - Path segments to resolve
 * @returns {string} The resolved absolute path
 *
 * @example
 * ```typescript
 * resolve('foo', 'bar', 'baz')           // '/cwd/foo/bar/baz'
 * resolve('/foo', 'bar', 'baz')          // '/foo/bar/baz'
 * resolve('foo', '/bar', 'baz')          // '/bar/baz'
 * resolve()                              // '/cwd'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolve(...segments: string[]): string {
  let resolvedPath = ''
  let resolvedAbsolute = false

  for (let i = segments.length - 1; i >= 0 && !resolvedAbsolute; i -= 1) {
    const segment = segments[i]

    /* c8 ignore start */
    if (typeof segment !== 'string' || segment.length === 0) {
      continue
    }

    resolvedPath =
      segment + (resolvedPath.length === 0 ? '' : `/${resolvedPath}`)

    resolvedAbsolute = isAbsolute(segment)
  }

  if (!resolvedAbsolute) {
    const cwd = /*@__PURE__*/ require('node:process').cwd()
    resolvedPath = cwd + (resolvedPath.length === 0 ? '' : `/${resolvedPath}`)
  }
  /* c8 ignore stop */

  return normalizePath(resolvedPath)
}
