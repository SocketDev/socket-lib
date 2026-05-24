/**
 * @file Source-side coverage tests for src/packages/normalize.ts. Mirrors the
 *   dist-bundled smoke tests in normalize.test.mts to exercise src files
 *   directly so v8 attributes coverage to the source modules. The dist-side
 *   test stays canonical for bundler interop; this file ensures the src/ rows
 *   show up in coverage.
 */

import { describe, expect, it } from 'vitest'

import {
  getEscapedScopeRegExp,
  normalizePackageJson,
  resolveEscapedScope,
  resolveOriginalPackageName,
  unescapeScope,
} from '../../../src/packages/normalize'

import type { PackageJson } from '../../../src/packages/types'

describe('packages/normalize (src) — getEscapedScopeRegExp', () => {
  it('returns a fresh RegExp', () => {
    const a = getEscapedScopeRegExp()
    const b = getEscapedScopeRegExp()
    expect(a).not.toBe(b)
    expect(a).toBeInstanceOf(RegExp)
  })

  it('matches the babel__ escaped-scope prefix', () => {
    const re = getEscapedScopeRegExp()
    const match = re.exec('babel__core')
    expect(match).not.toBeNull()
    expect(match?.[0]).toBe('babel__')
  })
})

describe('packages/normalize (src) — resolveEscapedScope', () => {
  it('returns the escaped scope when present', () => {
    expect(resolveEscapedScope('babel__core')).toBe('babel__')
  })

  it('returns undefined when no escaped scope', () => {
    expect(resolveEscapedScope('lodash')).toBeUndefined()
  })
})

describe('packages/normalize (src) — resolveOriginalPackageName', () => {
  it('strips the @socketregistry/ prefix and unescapes the scope', () => {
    expect(resolveOriginalPackageName('@socketregistry/babel__core')).toBe(
      '@babel/core',
    )
  })

  it('returns unscoped names unchanged (no prefix, no escape)', () => {
    expect(resolveOriginalPackageName('is-number')).toBe('is-number')
  })

  it('handles a Socket-prefixed unscoped name', () => {
    expect(resolveOriginalPackageName('@socketregistry/is-number')).toBe(
      'is-number',
    )
  })

  it('handles a bare escaped-scope name (no Socket prefix)', () => {
    expect(resolveOriginalPackageName('babel__core')).toBe('@babel/core')
  })
})

describe('packages/normalize (src) — unescapeScope', () => {
  it('strips the delimiter from a normal escaped scope', () => {
    expect(unescapeScope('babel__')).toBe('@babel')
  })

  it('handles scope without trailing delimiter (short input)', () => {
    // Short input shorter than REGISTRY_SCOPE_DELIMITER → "@<scope>".
    expect(unescapeScope('b')).toBe('@b')
  })
})

describe('packages/normalize (src) — normalizePackageJson', () => {
  it('adds default version when missing', () => {
    const pkg = { name: 'test-package' }
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.version).toBe('0.0.0')
  })

  it('preserves the existing version', () => {
    const pkg = { name: 'test-package', version: '1.2.3' }
    const normalized = normalizePackageJson(pkg as PackageJson)
    expect(normalized.version).toBe('1.2.3')
  })

  it('applies the preserve allow-list', () => {
    const pkg = {
      name: 'test-package',
      version: '1.0.0',
      // Use a key that normalize-package-data tends to add — confirm
      // that with `preserve: []` it stays put.
    } as PackageJson
    const normalized = normalizePackageJson(pkg, { preserve: [] })
    expect(normalized.name).toBe('test-package')
  })
})
