/**
 * @file URL search-param coercion helpers — `urlSearchParamsAs*` normalise a
 *   raw `string | null | undefined` value into a typed shape (array / boolean /
 *   number / string) with a default. `urlSearchParamsGet*` take a
 *   `URLSearchParams` instance and a key.
 */

import { NumberIsNaN } from '../primordials/number'

import type {
  UrlSearchParamsAsBooleanOptions,
  UrlSearchParamsAsNumberOptions,
  UrlSearchParamsAsStringOptions,
  UrlSearchParamsGetBooleanOptions,
} from './types'

const BooleanCtor = Boolean

/**
 * Convert a URL search parameter to an array.
 *
 * @example
 *   ;```typescript
 *   urlSearchParamsAsArray('a, b, c') // ['a', 'b', 'c']
 *   urlSearchParamsAsArray(null) // []
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamsAsArray(
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
 *   ;```typescript
 *   urlSearchParamsAsBoolean('true') // true
 *   urlSearchParamsAsBoolean('0') // false
 *   urlSearchParamsAsBoolean(null) // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamsAsBoolean(
  value: string | null | undefined,
  options?: UrlSearchParamsAsBooleanOptions | undefined,
): boolean {
  const { defaultValue = false } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamsAsBooleanOptions
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
      lowered === 'on' ||
      lowered === 'true' ||
      lowered === 'yes'
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
 *   ;```typescript
 *   const params = new URLSearchParams('limit=10')
 *   urlSearchParamsAsNumber(params, 'limit') // 10
 *   urlSearchParamsAsNumber(params, 'other') // 0
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamsAsNumber(
  params: URLSearchParams | null | undefined,
  key: string,
  options?: UrlSearchParamsAsNumberOptions | undefined,
): number {
  const { defaultValue = 0 } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamsAsNumberOptions
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
 *   ;```typescript
 *   const params = new URLSearchParams('name=socket')
 *   urlSearchParamsAsString(params, 'name') // 'socket'
 *   urlSearchParamsAsString(params, 'other') // ''
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function urlSearchParamsAsString(
  params: URLSearchParams | null | undefined,
  key: string,
  options?: UrlSearchParamsAsStringOptions | undefined,
): string {
  const { defaultValue = '' } = {
    __proto__: null,
    ...options,
  } as UrlSearchParamsAsStringOptions
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
 *   ;```typescript
 *   const params = new URLSearchParams('tags=a,b,c')
 *   urlSearchParamsGetArray(params, 'tags') // ['a', 'b', 'c']
 *   ```
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
      return urlSearchParamsAsArray(firstValue)
    }
    return values
  }
  return []
}

/**
 * Helper to get boolean from URLSearchParams.
 *
 * @example
 *   ;```typescript
 *   const params = new URLSearchParams('debug=true')
 *   urlSearchParamsGetBoolean(params, 'debug') // true
 *   urlSearchParamsGetBoolean(params, 'other') // false
 *   ```
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
      ? urlSearchParamsAsBoolean(value, { defaultValue })
      : defaultValue
  }
  return defaultValue
}
