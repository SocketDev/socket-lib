/**
 * @fileoverview Unit tests for
 * src/eco/npm/npm/extract-package-name-from-path.ts.
 */

import { describe, expect, it } from 'vitest'

import { extractPackageNameFromPath } from '@socketsecurity/lib/eco/npm/npm/extract-package-name-from-path'

describe('eco/npm/npm/extract-package-name-from-path', () => {
  it('returns the final segment for a flat node_modules path', () => {
    expect(extractPackageNameFromPath('node_modules/lodash')).toBe('lodash')
  })

  it('returns the deepest package for nested node_modules', () => {
    expect(
      extractPackageNameFromPath(
        'node_modules/a/node_modules/b/node_modules/c',
      ),
    ).toBe('c')
  })

  it('preserves scoped package names', () => {
    expect(extractPackageNameFromPath('node_modules/@scope/pkg')).toBe(
      '@scope/pkg',
    )
  })

  it('preserves scoped packages inside nested paths', () => {
    expect(
      extractPackageNameFromPath('node_modules/a/node_modules/@scope/b'),
    ).toBe('@scope/b')
  })

  it('handles Windows-style separators', () => {
    expect(extractPackageNameFromPath('node_modules\\a\\node_modules\\b')).toBe(
      'b',
    )
  })

  it('returns the original path if no node_modules prefix is present', () => {
    expect(extractPackageNameFromPath('vendor/foo')).toBe('vendor/foo')
  })
})
