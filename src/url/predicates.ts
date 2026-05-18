/**
 * @file URL type-guard predicates — `isUrl` answers whether a value parses as a
 *   valid URL via `parseUrl`.
 */

import { parseUrl } from './parse'

/**
 * Check if a value is a valid URL.
 *
 * @example
 *   ;```typescript
 *   isUrl('https://example.com') // true
 *   isUrl('not a url') // false
 *   isUrl(null) // false
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isUrl(value: string | URL | null | undefined): boolean {
  return (
    ((typeof value === 'string' && value !== '') ||
      (value !== null && typeof value === 'object')) &&
    !!parseUrl(value)
  )
}
