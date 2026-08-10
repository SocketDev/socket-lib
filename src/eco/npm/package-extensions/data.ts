/**
 * @file Per-package `package.json` overrides, keyed by package name and
 *   version range. An extension patches a dependency's own manifest to repair
 *   a missing peer dependency or a wrong field, without a fork or a patch file.
 *   Manager-agnostic, which is why this sits at the ecosystem tier beside
 *   `manifest-format.ts` rather than under `npm/`: yarn and pnpm both read a
 *   `packageExtensions` config, and the seed list here is Yarn's curated set
 *   (`external/@yarnpkg/extensions`) merged with Socket's additions.
 */

import { packageExtensions as yarnPackageExtensions } from '../../../external/@yarnpkg/extensions'

import type { PackageExtension } from './types'

const { freeze: ObjectFreeze } = Object

const packageExtensions = ObjectFreeze(
  (
    [
      /* c8 ignore next - External @yarnpkg/extensions data */
      ...yarnPackageExtensions,
      [
        '@yarnpkg/extensions@>=1.1.0',
        {
          // Properties with undefined values are omitted when saved as JSON.
          peerDependencies: undefined,
        },
      ],
      [
        'abab@>=2.0.0',
        {
          devDependencies: {
            // Lower the Webpack from v4.x to one supported by abab's peers.
            webpack: '^3.12.0',
          },
        },
      ],
      [
        'is-generator-function@>=1.0.7',
        {
          scripts: {
            // Make the script a silent no-op.
            'test:uglified': '',
          },
        },
      ],
    ] as PackageExtension[]
  ).toSorted((a_, b_) => {
    const aIndex = a_[0].lastIndexOf('@')
    const bIndex = b_[0].lastIndexOf('@')
    const a = aIndex === -1 ? a_[0] : a_[0].slice(0, aIndex)
    const b = bIndex === -1 ? b_[0] : b_[0].slice(0, bIndex)
    // Simulate the default compareFn of String.prototype.sort.
    if (a < b) {
      return -1
    }
    if (a > b) {
      return 1
    }
    return 0
  }),
)

export { packageExtensions }
