/**
 * @file `findPackageExtensions` against the real overrides table. The
 *   selectors used here are entries the seed list actually carries, so a case
 *   that stops matching means the table changed rather than that the matcher
 *   drifted. Asserting the merged patch rather than "an object or undefined"
 *   is what makes the version-range half of the selector load-bearing.
 */

import { describe, expect, it } from 'vitest'

import { findPackageExtensions } from '../../../src/packages/metadata-extensions.mjs'

describe('packages/metadata-extensions — findPackageExtensions', () => {
  it('reports nothing for a package the table does not list', () => {
    expect(
      findPackageExtensions('no-such-example-package', '1.0.0'),
    ).toBeUndefined()
  })

  it('merges the patch for a version inside the selector range', () => {
    const result = findPackageExtensions('abab', '2.0.6')

    expect(result).toEqual({ devDependencies: { webpack: '^3.12.0' } })
  })

  it('reports nothing for a version outside the selector range', () => {
    // The name matches and the range does not, which is the case a
    // name-only match would get wrong.
    expect(findPackageExtensions('abab', '1.0.0')).toBeUndefined()
  })

  it('reports nothing for a version string semver cannot read', () => {
    expect(findPackageExtensions('abab', 'not-a-version')).toBeUndefined()
  })

  it('matches a scoped name, whose own @ must not split the selector', () => {
    const result = findPackageExtensions('@yarnpkg/extensions', '1.1.0')

    expect(result).toBeDefined()
  })

  it('patches scripts as readily as dependencies', () => {
    const result = findPackageExtensions('is-generator-function', '1.0.10')

    expect(result).toEqual({ scripts: { 'test:uglified': '' } })
  })
})
