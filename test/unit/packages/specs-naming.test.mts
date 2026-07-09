/**
 * @file Unit tests for package-name resolution/normalization utilities in
 *   package spec parsing:
 *
 *   - resolvePackageName() joins a purl-shaped `{ name, namespace }` back into a
 *     scoped package name with a configurable delimiter
 *   - pkgNameToSlug() slugifies a scoped package name for filesystem-safe use
 *   - resolveRegistryPackageName() escapes scoped names for registry storage
 */

import { describe, expect, it } from 'vitest'

import {
  pkgNameToSlug,
  resolvePackageName,
  resolveRegistryPackageName,
} from '../../../src/packages/specs'

describe('packages/specs — resolvePackageName', () => {
  it('should return name for unscoped package', () => {
    const purlObj = { name: 'package' }
    expect(resolvePackageName(purlObj)).toBe('package')
  })

  it('should return scoped name with default delimiter', () => {
    const purlObj = { name: 'package', namespace: '@scope' }
    expect(resolvePackageName(purlObj)).toBe('@scope/package')
  })

  it('should use custom delimiter', () => {
    const purlObj = { name: 'package', namespace: '@scope' }
    expect(resolvePackageName(purlObj, '--')).toBe('@scope--package')
  })

  it('should handle empty namespace', () => {
    const purlObj = { name: 'package', namespace: '' }
    expect(resolvePackageName(purlObj)).toBe('package')
  })

  it('should handle undefined namespace', () => {
    const purlObj = { name: 'package' }
    expect(resolvePackageName(purlObj)).toBe('package')
  })

  it('should use default / delimiter when not specified', () => {
    const purlObj = { name: 'mypackage', namespace: '@myorg' }
    expect(resolvePackageName(purlObj)).toBe('@myorg/mypackage')
  })

  it('should handle resolvePackageName with null values', () => {
    const purlObj = { name: 'package', namespace: undefined }
    const result = resolvePackageName(purlObj)
    expect(result).toBe('package')
  })
})

describe('packages/specs — pkgNameToSlug', () => {
  it('should slugify a scoped package name', () => {
    expect(pkgNameToSlug('@socketsecurity/lib')).toBe('socketsecurity-lib')
  })

  it('should slugify a scoped package name with multi-token scope', () => {
    expect(pkgNameToSlug('@cyclonedx/cdxgen')).toBe('cyclonedx-cdxgen')
  })

  it('should pass an unscoped package name through unchanged', () => {
    expect(pkgNameToSlug('lodash')).toBe('lodash')
  })

  it('should pass a sentinel CLI-style name through unchanged', () => {
    expect(pkgNameToSlug('sdxgen')).toBe('sdxgen')
  })

  it('should only replace the first slash (the scope separator)', () => {
    expect(pkgNameToSlug('@scope/name/sub')).toBe('scope-name/sub')
  })

  it('should leave bare names that start with non-@ alone even if they contain a slash', () => {
    expect(pkgNameToSlug('weird/name')).toBe('weird/name')
  })
})

describe('packages/specs — resolveRegistryPackageName', () => {
  it('escapes scoped package names with double-underscore', () => {
    expect(resolveRegistryPackageName('@babel/core')).toBe('babel__core')
  })

  it('returns unscoped names verbatim', () => {
    expect(resolveRegistryPackageName('lodash')).toBe('lodash')
  })

  it('handles dotted scope', () => {
    expect(resolveRegistryPackageName('@scope.with.dots/pkg')).toBe(
      'scope.with.dots__pkg',
    )
  })

  it('handles complex nested scope names', () => {
    expect(resolveRegistryPackageName('@types/node')).toBe('types__node')
  })
})
