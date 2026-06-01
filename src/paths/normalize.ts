/**
 * @file Path normalization — the core `normalizePath` and its MSYS drive-letter
 *   helper. The rest of the path module's surface (predicates, conversion,
 *   resolution) lives in sibling leaves and is re-exported here so existing
 *   `paths/normalize` importers keep working.
 *
 *   - `normalizePath` — backslash → forward-slash, segment collapse, UNC +
 *     namespace preservation
 *   - `msysDriveToNative` — `/c/path` → `C:/path` on Windows
 */

import { WIN32 } from '../constants/platform'

import { search } from '../strings/search'

import {
  StringPrototypeCharCodeAt,
  StringPrototypeSlice,
} from '../primordials/string'

import { msysDriveRegExp, pathLikeToString, slashRegExp } from './_internal'

// A normalized path that is exactly a bare Windows drive letter (`C:`).
const DRIVE_LETTER_REGEXP = /^[A-Za-z]:$/

// On Windows, convert MSYS drive notation to native: /c/path → C:/path
export function msysDriveToNative(normalized: string): string {
  /* c8 ignore start - Windows-only branch. */
  if (WIN32) {
    return normalized.replace(
      msysDriveRegExp,
      (_, letter, sep) => `${letter.toUpperCase()}:${sep || '/'}`,
    )
  }
  /* c8 ignore stop */
  return normalized
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
  if (length < 2) {
    return length === 1 &&
      StringPrototypeCharCodeAt(filepath, 0) === 92 /*'\\'*/
      ? '/'
      : filepath
  }

  let code = 0
  let start = 0

  // Ensure win32 namespaces have two leading slashes so they are handled
  // properly by path.win32.parse() after being normalized.
  // https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#namespaces
  let prefix = ''
  if (length > 4 && StringPrototypeCharCodeAt(filepath, 3) === 92 /*'\\'*/) {
    const code2 = StringPrototypeCharCodeAt(filepath, 2)
    // Look for \\?\ or \\.\
    if (
      (code2 === 63 /*'?'*/ || code2 === 46) /*'.'*/ &&
      StringPrototypeCharCodeAt(filepath, 0) === 92 /*'\\'*/ &&
      StringPrototypeCharCodeAt(filepath, 1) === 92 /*'\\'*/
    ) {
      start = 2
      prefix = '//'
    }
  }
  if (start === 0) {
    /* c8 ignore start - UNC path detection (\\server\share). Rare
       input; not exercised by typical test fixtures. */
    // UNC paths must start with exactly two slashes, not more.
    if (
      length > 2 &&
      ((StringPrototypeCharCodeAt(filepath, 0) === 92 /*'\\'*/ &&
        StringPrototypeCharCodeAt(filepath, 1) === 92 /*'\\'*/ &&
        StringPrototypeCharCodeAt(filepath, 2) !== 92) /*'\\'*/ ||
        (StringPrototypeCharCodeAt(filepath, 0) === 47 /*'/'*/ &&
          StringPrototypeCharCodeAt(filepath, 1) === 47 /*'/'*/ &&
          StringPrototypeCharCodeAt(filepath, 2) !== 47)) /*'/'*/
    ) {
      // Valid UNC requires server/share.
      let firstSegmentEnd = -1
      let hasSecondSegment = false

      // Skip leading slashes after the initial double slash.
      let i = 2
      while (
        i < length &&
        (StringPrototypeCharCodeAt(filepath, i) === 47 /*'/'*/ ||
          StringPrototypeCharCodeAt(filepath, i) === 92) /*'\\'*/
      ) {
        i++
      }

      // Find the end of first segment (server name).
      while (i < length) {
        const char = StringPrototypeCharCodeAt(filepath, i)
        if (char === 47 /*'/'*/ || char === 92 /*'\\'*/) {
          firstSegmentEnd = i
          break
        }
        i++
      }

      if (firstSegmentEnd > 2) {
        i = firstSegmentEnd
        while (
          i < length &&
          (StringPrototypeCharCodeAt(filepath, i) === 47 /*'/'*/ ||
            StringPrototypeCharCodeAt(filepath, i) === 92) /*'\\'*/
        ) {
          i++
        }
        if (i < length) {
          hasSecondSegment = true
        }
      }

      if (firstSegmentEnd > 2 && hasSecondSegment) {
        // Valid UNC — preserve double leading slashes.
        start = 2
        prefix = '//'
      } else {
        // Repeated slashes, treat as regular path.
        code = StringPrototypeCharCodeAt(filepath, start)
        while (code === 47 /*'/'*/ || code === 92 /*'\\'*/) {
          start += 1
          code = StringPrototypeCharCodeAt(filepath, start)
        }
        if (start) {
          prefix = '/'
        }
      }
      /* c8 ignore stop */
    } else {
      // Trim leading slashes for regular paths.
      code = StringPrototypeCharCodeAt(filepath, start)
      while (code === 47 /*'/'*/ || code === 92 /*'\\'*/) {
        start += 1
        code = StringPrototypeCharCodeAt(filepath, start)
      }
      if (start) {
        prefix = '/'
      }
    }
  }
  let nextIndex = search(filepath, slashRegExp, { fromIndex: start })
  // Single-segment-no-separator early-return path; sub-arms each fire on
  // specific inputs.
  /* c8 ignore start */
  if (nextIndex === -1) {
    const segment = filepath.slice(start)
    if (segment === '.' || segment.length === 0) {
      return prefix || '.'
    }
    if (segment === '..') {
      return prefix ? StringPrototypeSlice(prefix, 0, -1) || '/' : '..'
    }
    return msysDriveToNative(prefix + segment)
  }
  /* c8 ignore stop */
  // Process segments and handle '.', '..', and empty segments.
  /* c8 ignore start */
  let collapsed = ''
  let segmentCount = 0
  let leadingDotDots = 0
  while (nextIndex !== -1) {
    const segment = filepath.slice(start, nextIndex)
    if (segment.length > 0 && segment !== '.') {
      if (segment === '..') {
        if (segmentCount > 0) {
          const lastSeparatorIndex = collapsed.lastIndexOf('/')
          if (lastSeparatorIndex === -1) {
            collapsed = ''
            segmentCount = 0
            if (leadingDotDots > 0 && !prefix) {
              collapsed = '..'
              leadingDotDots = 1
            }
          } else {
            const lastSegmentStart = lastSeparatorIndex + 1
            const lastSegmentValue = collapsed.slice(lastSegmentStart)
            if (lastSegmentValue === '..') {
              collapsed = `${collapsed}/${segment}`
              leadingDotDots += 1
            } else {
              collapsed = collapsed.slice(0, lastSeparatorIndex)
              segmentCount -= 1
            }
          }
        } else if (!prefix) {
          collapsed = collapsed + (collapsed.length === 0 ? '' : '/') + segment
          leadingDotDots += 1
        }
      } else {
        collapsed = collapsed + (collapsed.length === 0 ? '' : '/') + segment
        segmentCount += 1
      }
    }
    start = nextIndex + 1
    code = StringPrototypeCharCodeAt(filepath, start)
    while (code === 47 /*'/'*/ || code === 92 /*'\\'*/) {
      start += 1
      code = StringPrototypeCharCodeAt(filepath, start)
    }
    nextIndex = search(filepath, slashRegExp, { fromIndex: start })
  }
  const lastSegment = filepath.slice(start)
  if (lastSegment.length > 0 && lastSegment !== '.') {
    if (lastSegment === '..') {
      if (segmentCount > 0) {
        const lastSeparatorIndex = collapsed.lastIndexOf('/')
        if (lastSeparatorIndex === -1) {
          collapsed = ''
          segmentCount = 0
          if (leadingDotDots > 0 && !prefix) {
            collapsed = '..'
            leadingDotDots = 1
          }
        } else {
          const lastSegmentStart = lastSeparatorIndex + 1
          const lastSegmentValue = collapsed.slice(lastSegmentStart)
          if (lastSegmentValue === '..') {
            collapsed = `${collapsed}/${lastSegment}`
            leadingDotDots += 1
          } else {
            collapsed = collapsed.slice(0, lastSeparatorIndex)
            segmentCount -= 1
          }
        }
      } else if (!prefix) {
        collapsed =
          collapsed + (collapsed.length === 0 ? '' : '/') + lastSegment
        leadingDotDots += 1
      }
    } else {
      collapsed = collapsed + (collapsed.length === 0 ? '' : '/') + lastSegment
      segmentCount += 1
    }
  }
  /* c8 ignore stop */

  if (collapsed.length === 0) {
    return prefix || '.'
  }
  // A bare drive letter that came from a drive ROOT keeps its slash: `D:\` and
  // `D:/` normalize to `D:/`, not `D:`. The trailing separator is significant
  // on a drive root — `D:` alone means "current directory on D:", a different
  // location. Detected by a separator immediately after the colon in the
  // original input (index 2), so drive-relative `D:foo` is unaffected.
  if (
    DRIVE_LETTER_REGEXP.test(collapsed) &&
    (StringPrototypeCharCodeAt(filepath, 2) === 47 /*'/'*/ ||
      StringPrototypeCharCodeAt(filepath, 2) === 92) /*'\\'*/
  ) {
    return msysDriveToNative(`${prefix}${collapsed}/`)
  }
  return msysDriveToNative(prefix + collapsed)
}

// Re-exports — preserve the historical `paths/normalize` surface so
// downstream importers don't have to chase the split.
export { getUrl, pathLikeToString } from './_internal'
export {
  fromUnixPath,
  splitPath,
  toUnixPath,
  trimLeadingDotSlash,
} from './conversion'
export {
  isAbsolute,
  isNodeModules,
  isPath,
  isPathSeparator,
  isRelative,
  isUnixPath,
  isWindowsDeviceRoot,
} from './predicates'
export { relative, relativeResolve, resolve } from './resolve'
