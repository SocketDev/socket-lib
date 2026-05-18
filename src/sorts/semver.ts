/**
 * @file Semver-aware string comparison. Wraps the vendored `external/semver`
 *   accessor so callers don't have to thread the lazy-load themselves.
 */

import { getSemver } from './_internal'

/**
 * Compare semantic versions.
 *
 * @example
 *   ;```typescript
 *   compareSemver('1.0.0', '2.0.0') // -1
 *   compareSemver('2.0.0', '1.0.0') // 1
 *   compareSemver('1.0.0', '1.0.0') // 0
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function compareSemver(a: string, b: string): number {
  // External semver calls
  /* c8 ignore start */
  const semver = getSemver()
  const validA: string | null = semver.valid(a)
  /* c8 ignore stop */
  const validB: string | null = semver.valid(b)

  if (!validA && !validB) {
    return 0
  }
  if (!validA) {
    return -1
  }
  if (!validB) {
    return 1
  }
  /* c8 ignore next - External semver call */
  return semver.compare(a, b) as number
}
