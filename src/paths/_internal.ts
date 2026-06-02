/**
 * @file Shared internals for the `paths/` module — the leaf-level primitives
 *   every other path leaf depends on. Kept as a single file so `normalize`,
 *   `predicates`, `conversion`, and `resolve` can layer above it without
 *   circular imports.
 *
 *   - char-code constants + shared regexps
 *   - `getUrl` — lazy `node:url` loader
 *   - `pathLikeToString` — `string | Buffer | URL` → `string`
 */

import type nodeUrl from 'node:url'

import { WIN32 } from '../constants/platform'

import { BufferIsBuffer } from '../primordials/buffer'

import {
  StringPrototypeCharAt,
  StringPrototypeCharCodeAt,
  StringPrototypeStartsWith,
} from '../primordials/string'

// '\'
export const CHAR_BACKWARD_SLASH = 92
// ':'
export const CHAR_COLON = 58
// '/'
export const CHAR_FORWARD_SLASH = 47
// 'a'
export const CHAR_LOWERCASE_A = 97
// 'z'
export const CHAR_LOWERCASE_Z = 122
// 'A'
export const CHAR_UPPERCASE_A = 65
// 'Z'
export const CHAR_UPPERCASE_Z = 90

// Captures the drive letter (group 1) and the trailing separator if any
// (group 2). The replace callback in paths/normalize.ts:msysDriveToNative
// reads both — non-capturing groups would leave `letter` undefined and
// `.toUpperCase()` would throw on Windows MSYS-style paths like `/c/foo`.
// oxlint-disable-next-line socket/prefer-non-capturing-group -- both groups are read by the replace callback in paths/normalize.ts:msysDriveToNative
export const msysDriveRegExp = /^\/([a-zA-Z])($|\/)/
export const nodeModulesPathRegExp = /(?:[/\\]|^)node_modules(?:$|[/\\])/
export const slashRegExp = /[/\\]/

let cachedUrl: typeof nodeUrl | undefined

/**
 * Lazily load the url module.
 *
 * Performs on-demand loading of Node.js url module to avoid initialization
 * overhead and potential Webpack bundling errors.
 *
 * @private
 */
export function getUrl() {
  if (cachedUrl === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    cachedUrl = /*@__PURE__*/ require('node:url')
  }
  return cachedUrl as typeof nodeUrl
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
  const url = getUrl()
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
      if (WIN32 && StringPrototypeStartsWith(decodedPathname, '/')) {
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
