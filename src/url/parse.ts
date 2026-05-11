/**
 * @fileoverview URL parsing helpers — `parseUrl` (safe `new URL(...)`
 * wrapper that returns `undefined` instead of throwing) and
 * `createRelativeUrl` (compose a relative path against an optional
 * base).
 */

import {
  StringPrototypeEndsWith,
  StringPrototypeReplace,
} from '../primordials/string'

import type { CreateRelativeUrlOptions } from './types'

const UrlCtor = URL

/**
 * Create a relative URL for testing.
 *
 * @example
 * ```typescript
 * createRelativeUrl('/api/test')                                    // 'api/test'
 * createRelativeUrl('/api/test', { base: 'https://example.com' })  // 'https://example.com/api/test'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function createRelativeUrl(
  path: string,
  options?: CreateRelativeUrlOptions | undefined,
): string {
  const { base = '' } = {
    __proto__: null,
    ...options,
  } as CreateRelativeUrlOptions
  // Remove leading slash to make it relative.
  const relativePath = StringPrototypeReplace(path, /^\//, '')

  if (base) {
    let baseUrl = base
    if (!StringPrototypeEndsWith(baseUrl, '/')) {
      baseUrl += '/'
    }
    return baseUrl + relativePath
  }

  return relativePath
}

/**
 * Parse a value as a URL.
 *
 * @example
 * ```typescript
 * parseUrl('https://example.com')  // URL { href: 'https://example.com/' }
 * parseUrl('invalid')              // undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function parseUrl(value: string | URL): URL | undefined {
  try {
    return new UrlCtor(value)
  } catch {}
  return undefined
}
