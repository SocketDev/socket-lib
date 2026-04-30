/**
 * @fileoverview URL parsing and validation utilities.
 * Provides URL validation, normalization, and parsing helpers.
 */

import { NumberIsNaN, StringPrototypeEndsWith } from './primordials'

const BooleanCtor = Boolean
const UrlCtor = URL

export interface CreateRelativeUrlOptions {
  base?: string
}

export interface UrlSearchParamAsBooleanOptions {
  defaultValue?: boolean
}

export interface UrlSearchParamAsNumberOptions {
  defaultValue?: number
}

export interface UrlSearchParamAsStringOptions {
  defaultValue?: string
}

export interface UrlSearchParamsGetBooleanOptions {
  defaultValue?: boolean
}

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
  const relativePath = path.replace(/^\//, '')

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
 * Check if a value is a valid URL.
 *
 * @example
 * ```typescript
 * isUrl('https://example.com') // true
 * isUrl('not a url')           // false
 * isUrl(null)                  // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isUrl(value: string | URL | null | undefined): boolean {
  return (
    ((typeof value === 'string' && value !== '') ||
      (value !== null && typeof value === 'object')) &&
    !!parseUrl(value)
  )
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

/**
 * Convert a URL search parameter to an array.
 *
 * @example
 * ```typescript
 * urlSearchParamAsArray('a, b, c') // ['a', 'b', 'c']
 * urlSearchParamAsArray(null)      // []
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamAsArray(
  value: string | null | undefined,
): string[] {
  return typeof value === 'string'
    ? value
        .trim()
        .split(/, */)
        .map(v => v.trim())
        .filter(BooleanCtor)
    : []
}

/**
 * Convert a URL search parameter to a boolean.
 *
 * @example
 * ```typescript
 * urlSearchParamAsBoolean('true') // true
 * urlSearchParamAsBoolean('0')    // false
 * urlSearchParamAsBoolean(null)   // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamAsBoolean(
  value: string | null | undefined,
  options?: UrlSearchParamAsBooleanOptions | undefined,
): boolean {
  const { defaultValue = false } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamAsBooleanOptions
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // Empty string → use defaultValue, same as null/undefined. Previously
    // fell through to the final truthy check and returned false, silently
    // bypassing `defaultValue: true`.
    if (trimmed === '') {
      return !!defaultValue
    }
    const lowered = trimmed.toLowerCase()
    // Accept the same truthy vocabulary as `envAsBoolean` so query-string
    // flags behave predictably cross-context: '1', 'true', 'yes', 'on'.
    return (
      lowered === '1' ||
      lowered === 'true' ||
      lowered === 'yes' ||
      lowered === 'on'
    )
  }
  if (value === null || value === undefined) {
    return !!defaultValue
  }
  return !!value
}

/**
 * Get number value from URLSearchParams with a default.
 *
 * @example
 * ```typescript
 * const params = new URLSearchParams('limit=10')
 * urlSearchParamAsNumber(params, 'limit') // 10
 * urlSearchParamAsNumber(params, 'other') // 0
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamAsNumber(
  params: URLSearchParams | null | undefined,
  key: string,
  options?: UrlSearchParamAsNumberOptions | undefined,
): number {
  const { defaultValue = 0 } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamAsNumberOptions
  if (params && typeof params.get === 'function') {
    const value = params.get(key)
    if (value !== null) {
      const num = Number(value)
      return !NumberIsNaN(num) ? num : defaultValue
    }
  }
  return defaultValue
}

/**
 * Get string value from URLSearchParams with a default.
 *
 * @example
 * ```typescript
 * const params = new URLSearchParams('name=socket')
 * urlSearchParamAsString(params, 'name')  // 'socket'
 * urlSearchParamAsString(params, 'other') // ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamAsString(
  params: URLSearchParams | null | undefined,
  key: string,
  options?: UrlSearchParamAsStringOptions | undefined,
): string {
  const { defaultValue = '' } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamAsStringOptions
  if (params && typeof params.get === 'function') {
    const value = params.get(key)
    return value !== null ? value : defaultValue
  }
  return defaultValue
}

/**
 * Helper to get array from URLSearchParams.
 *
 * @example
 * ```typescript
 * const params = new URLSearchParams('tags=a,b,c')
 * urlSearchParamsGetArray(params, 'tags') // ['a', 'b', 'c']
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamsGetArray(
  params: URLSearchParams | null | undefined,
  key: string,
): string[] {
  if (params && typeof params.getAll === 'function') {
    const values = params.getAll(key)
    // If single value contains commas, split it
    const firstValue = values[0]
    if (values.length === 1 && firstValue && firstValue.includes(',')) {
      return urlSearchParamAsArray(firstValue)
    }
    return values
  }
  return []
}

/**
 * Helper to get boolean from URLSearchParams.
 *
 * @example
 * ```typescript
 * const params = new URLSearchParams('debug=true')
 * urlSearchParamsGetBoolean(params, 'debug') // true
 * urlSearchParamsGetBoolean(params, 'other') // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamsGetBoolean(
  params: URLSearchParams | null | undefined,
  key: string,
  options?: UrlSearchParamsGetBooleanOptions | undefined,
): boolean {
  const { defaultValue = false } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamsGetBooleanOptions
  if (params && typeof params.get === 'function') {
    const value = params.get(key)
    return value !== null
      ? urlSearchParamAsBoolean(value, { defaultValue })
      : defaultValue
  }
  return defaultValue
}
