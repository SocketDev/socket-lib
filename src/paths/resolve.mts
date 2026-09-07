/**
 * @file Path resolution utilities — `resolve`, `relative`, `relativeResolve`.
 *   Split out of `paths/normalize.ts` for size hygiene.
 *
 *   - `resolve` — Node-style `path.resolve()` over absolute-path semantics
 *   - `relative` — relative path from one absolute to another
 *   - `relativeResolve` — `relative` + `normalizePath` convenience wrapper
 */

import { isWin32 } from '../constants/platform.mjs'

import { StringPrototypeCharCodeAt } from '../primordials/string.mjs'

import { isAbsolute, isPathSeparator } from './predicates.mjs'
import { CHAR_UPPERCASE_A, CHAR_UPPERCASE_Z, normalizePath } from './shared.mjs'

export function findCommonPathPrefix(actualFrom: string, actualTo: string) {
  // Compare paths char-by-char to find the longest common prefix.
  const length =
    actualFrom.length < actualTo.length
      ? actualFrom.length - 1
      : actualTo.length - 1
  let lastCommonSep = -1
  let i = 0

  for (; i < length; i += 1) {
    let fromCode = StringPrototypeCharCodeAt(actualFrom, 1 + i)
    let toCode = StringPrototypeCharCodeAt(actualTo, 1 + i)

    /* c8 ignore start - Windows-only case folding. */
    if (isWin32()) {
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
    if (isPathSeparator(StringPrototypeCharCodeAt(actualFrom, 1 + i))) {
      lastCommonSep = i
    }
  }

  return { __proto__: null, length, index: i, lastCommonSep }
}

/**
 * Calculate the relative path from one path to another.
 *
 * Both inputs are resolved to absolute paths first, then compared to find the
 * longest common base, and finally a relative path is constructed using `../`
 * for parent-directory traversal.
 *
 * Windows file systems are case-insensitive; the comparison reflects that.
 *
 * @example
 *   ;```typescript
 *   relative('/foo/bar', '/foo/baz') // '../baz'
 *   relative('/foo/bar/baz', '/foo') // '../..'
 *   relative('/foo', '/foo/bar') // 'bar'
 *   relative('/foo/bar', '/foo/bar') // ''
 *   ```
 *
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 *
 * @returns {string} Relative path from `from` to `to`, or empty string if equal
 */
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
  if (isWin32()) {
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

  const common = findCommonPathPrefix(actualFrom, actualTo)
  const { length, index: i } = common
  let { lastCommonSep } = common

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

  const out = relativePathParentSegments(
    actualFrom,
    fromStart + lastCommonSep + 1,
  )

  return out + actualTo.slice(toStart + lastCommonSep)
}

export function relativePathParentSegments(
  actualFrom: string,
  start: number,
): string {
  const fromEnd = actualFrom.length
  // Generate '../' segments for each directory in `from` after the common base.
  let out = ''
  for (let i = start; i <= fromEnd; i += 1) {
    const code = StringPrototypeCharCodeAt(actualFrom, i)
    if (i === fromEnd || isPathSeparator(code)) {
      out += out.length === 0 ? '..' : '/..'
    }
  }
  return out
}

/**
 * Get the normalized relative path from one path to another.
 *
 * Computes the relative path using `relative()` then runs the result through
 * `normalizePath()`. An empty string, meaning the same path, is preserved
 * verbatim rather than collapsed to `.`.
 *
 * @example
 *   ;```typescript
 *   relativeResolve('/foo/bar', '/foo/baz') // '../baz'
 *   relativeResolve('/foo/bar', '/foo/bar') // ''
 *   relativeResolve('/foo/./bar', '/foo/baz') // '../baz'
 *   ```
 *
 * @param {string} from - Source path.
 * @param {string} to - Destination path.
 *
 * @returns {string} Normalized relative path, or empty string if equal
 */
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
 * @example
 *   ;```typescript
 *   resolve('foo', 'bar', 'baz') // '/cwd/foo/bar/baz'
 *   resolve('/foo', 'bar', 'baz') // '/foo/bar/baz'
 *   resolve('foo', '/bar', 'baz') // '/bar/baz'
 *   resolve() // '/cwd'
 *   ```
 *
 * @param {...string} segments - Path segments to resolve.
 *
 * @returns {string} The resolved absolute path
 */
// oxlint-disable-next-line socket/exported-name-has-domain-word -- published leaf API; the module path carries the domain
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
