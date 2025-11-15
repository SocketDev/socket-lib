/**
 * @fileoverview Package extensions for compatibility adjustments.
 *
 * Package extensions allow modifying package.json fields of dependencies
 * to fix compatibility issues, missing peer dependencies, etc.
 */

import * as yarnPkgExtensions from './external/@yarnpkg/extensions.js'

const { freeze: ObjectFreeze } = Object

type PackageExtension = readonly [string, Record<string, unknown>]

const packageExtensions = ObjectFreeze(
  (
    [
      ...yarnPkgExtensions.packageExtensions,
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
  ).sort((a_, b_) => {
    const a = a_[0].slice(0, a_[0].lastIndexOf('@'))
    const b = b_[0].slice(0, b_[0].lastIndexOf('@'))
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
