/** @fileoverview Tests for package.json normalization utilities. */

import { describe, expect, it } from 'vitest'

import {
  normalizePackageJson,
  resolveEscapedScope,
  resolveOriginalPackageName,
  unescapeScope,
} from '../../../dist/packages/normalize.js'

import type { PackageJson } from '../../../dist/packages.js'

describe('normalizePackageJson', () => {
  it('should normalize basic package.json', () => {
    const pkg = { name: 'test-package' }
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.name).toBe('test-package')
    expect(normalized.version).toBe('0.0.0')
  })

  it('should preserve existing version', () => {
    const pkg = { name: 'test-package', version: '1.2.3' }
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.version).toBe('1.2.3')
  })

  it('should add default version when missing', () => {
    const pkg = { name: 'test-package' }
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.version).toBe('0.0.0')
  })

  it('should preserve custom fields with preserve option', () => {
    const pkg = { name: 'test-package', custom: 'value' }
    const normalized = normalizePackageJson(pkg as PackageJson, {
      preserve: ['custom'],
    })
    // Access custom field through Record type
    expect((normalized as Record<string, unknown>).custom).toBe('value')
  })

  it('should handle dependencies normalization', () => {
    const pkg = {
      name: 'test-package',
      dependencies: { lodash: '^4.0.0' },
    }
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.dependencies).toBeDefined()
    expect(normalized.dependencies?.lodash).toBe('^4.0.0')
  })

  it('should handle empty package.json', () => {
    const pkg = {}
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.version).toBe('0.0.0')
  })
})

describe('resolveEscapedScope', () => {
  it('should resolve escaped scope from Socket registry name', () => {
    const result = resolveEscapedScope('angular__cli')
    expect(result).toBe('angular__')
  })

  it('should return undefined for unscoped package', () => {
    const result = resolveEscapedScope('express')
    expect(result).toBeUndefined()
  })

  it('should handle empty string', () => {
    const result = resolveEscapedScope('')
    expect(result).toBeUndefined()
  })

  it('should handle package with scope only', () => {
    const result = resolveEscapedScope('scope__')
    expect(result).toBe('scope__')
  })

  it('should not match double underscore within package name', () => {
    const result = resolveEscapedScope('foo__bar__baz')
    expect(result).toBe('foo__')
  })
})

describe('resolveOriginalPackageName', () => {
  it('should convert Socket registry name to original scoped name', () => {
    const result = resolveOriginalPackageName('angular__cli')
    expect(result).toBe('@angular/cli')
  })

  it('should handle unscoped package names', () => {
    const result = resolveOriginalPackageName('express')
    expect(result).toBe('express')
  })

  it('should strip Socket registry scope prefix', () => {
    const result = resolveOriginalPackageName('@socketregistry/angular__cli')
    expect(result).toBe('@angular/cli')
  })

  it('should handle paths with remaining underscores', () => {
    // Only the first __ is converted to @/, remaining __ are preserved
    const result = resolveOriginalPackageName('angular__cli__packages')
    expect(result).toBe('@angular/cli__packages')
  })

  it('should handle simple scoped package', () => {
    const result = resolveOriginalPackageName('types__node')
    expect(result).toBe('@types/node')
  })
})

describe('unescapeScope', () => {
  it('should convert escaped scope to standard npm scope format', () => {
    const result = unescapeScope('angular__')
    expect(result).toBe('@angular')
  })

  it('should handle single delimiter', () => {
    const result = unescapeScope('scope__')
    expect(result).toBe('@scope')
  })

  it('should handle types scope', () => {
    const result = unescapeScope('types__')
    expect(result).toBe('@types')
  })

  it('should handle short scope names', () => {
    const result = unescapeScope('a__')
    expect(result).toBe('@a')
  })
})
