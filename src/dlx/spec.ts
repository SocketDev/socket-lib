/**
 * @file Parse `package@version` specs into `{name, version}`. Split out of
 *   `dlx/package.ts` for size hygiene. Uses npm-package-arg for the full
 *   grammar; falls back to a hand-rolled last-`@` parser when npm-package-arg
 *   can't handle the input.
 */

import npmPackageArg from '../external/npm-package-arg'

import {
  StringPrototypeLastIndexOf,
  StringPrototypeSlice,
} from '../primordials/string'

/**
 * Parse package spec into name and version using npm-package-arg. Examples: -
 * 'lodash@4.17.21' → { name: 'lodash', version: '4.17.21' } -
 * '@scope/pkg@1.0.0' → { name: '@scope/pkg', version: '1.0.0' } - 'lodash' → {
 * name: 'lodash', version: undefined }
 *
 * @example
 *   ;```typescript
 *   parsePackageSpec('lodash@4.17.21')
 *   // { name: 'lodash', version: '4.17.21' }
 *
 *   parsePackageSpec('@scope/pkg')
 *   // { name: '@scope/pkg', version: undefined }
 *   ```
 */
export function parsePackageSpec(spec: string): {
  name: string
  version: string | undefined
} {
  try {
    // npmPackageArg is imported at the top
    /* c8 ignore next - External npm-package-arg call */
    const parsed = npmPackageArg(spec)

    // Extract version from different types of specs.
    // For registry specs, use fetchSpec (the version/range).
    // For git/file/etc, version will be undefined.
    const version =
      parsed.type === 'tag'
        ? parsed.fetchSpec
        : parsed.type === 'version' || parsed.type === 'range'
          ? parsed.fetchSpec
          : undefined

    return {
      name: parsed.name || spec,
      version,
    }
  } catch {
    // Fallback to simple parsing if npm-package-arg fails.
    const atIndex = StringPrototypeLastIndexOf(spec, '@')
    if (atIndex === -1 || atIndex === 0) {
      // No version or scoped package without version (@ only at position 0).
      return { name: spec, version: undefined }
    }
    const sliced = StringPrototypeSlice(spec, atIndex + 1)
    return {
      name: StringPrototypeSlice(spec, 0, atIndex),
      // A trailing `@` (e.g. `'pkg@'`) yields an empty slice — normalize
      // to undefined so downstream "no version" checks behave.
      version: sliced || undefined,
    }
  }
}
