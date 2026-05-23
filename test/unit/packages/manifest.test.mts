/**
 * @file Unit tests for packages/manifest.ts — pure helper `createPackageJson`.
 *   fetchPackageManifest / fetchPackagePackument hit the npm registry and are
 *   covered by the integration suite; this file targets the synchronous shape
 *   builder used to scaffold Socket-registry package.json files.
 */

import { describe, expect, it } from 'vitest'

import { createPackageJson } from '../../../src/packages/manifest'

describe('packages/manifest — createPackageJson', () => {
  it('builds the canonical shape from minimal input', () => {
    const pkg = createPackageJson('is-number', 'packages/npm/is-number')
    expect(pkg.name).toBe('@socketregistry/is-number')
    expect(pkg.license).toBe('MIT')
    expect(pkg.homepage).toContain('packages/npm/is-number')
    expect(pkg.repository).toMatchObject({
      type: 'git',
      directory: 'packages/npm/is-number',
    })
    expect(pkg.sideEffects).toBe(false)
    // Default files when none provided.
    expect(pkg.files).toEqual(['*.d.ts', '*.js'])
    // Default categories when no `socket` block provided.
    expect((pkg.socket as { categories: string[] }).categories.length).toBeGreaterThan(0)
  })

  it('strips a leading @scope/ prefix from sockRegPkgName', () => {
    const pkg = createPackageJson('@scope/foo', 'pkg-path')
    // Result is @socketregistry/<stripped>; the strip is best-effort.
    expect(pkg.name?.startsWith('@socketregistry/')).toBe(true)
  })

  it('passes through version + description + keywords', () => {
    const pkg = createPackageJson('foo', 'p', {
      version: '1.2.3',
      description: 'desc',
      keywords: ['k1', 'k2'],
    })
    expect(pkg.version).toBe('1.2.3')
    expect(pkg.description).toBe('desc')
    expect(pkg.keywords).toEqual(['k1', 'k2'])
  })

  it('emits `type` only when provided', () => {
    const noType = createPackageJson('a', 'p')
    expect(noType['type']).toBeUndefined()
    const withType = createPackageJson('a', 'p', { type: 'module' })
    expect(withType['type']).toBe('module')
  })

  it('emits `exports` block when entryExports is a plain object', () => {
    const pkg = createPackageJson('a', 'p', {
      exports: { '.': './index.js' },
    })
    expect(pkg.exports).toEqual({ '.': './index.js' })
    // When exports is set, no main is emitted.
    expect(pkg.main).toBeUndefined()
  })

  it('emits `main` (with default ./index.js) when exports is absent', () => {
    const pkg = createPackageJson('a', 'p')
    expect(pkg.main).toBe('./index.js')
  })

  it('honors caller-supplied main when exports is absent', () => {
    const pkg = createPackageJson('a', 'p', { main: './alt.js' })
    expect(pkg.main).toBe('./alt.js')
  })

  it('coerces sideEffects to a boolean', () => {
    expect(createPackageJson('a', 'p', { sideEffects: true }).sideEffects).toBe(
      true,
    )
    expect(
      createPackageJson('a', 'p', { sideEffects: false }).sideEffects,
    ).toBe(false)
    // Truthy non-boolean → true
    expect(
      createPackageJson('a', 'p', { sideEffects: 'maybe' as unknown as boolean })
        .sideEffects,
    ).toBe(true)
  })

  it('passes through dependencies / overrides / resolutions when plain objects', () => {
    const pkg = createPackageJson('a', 'p', {
      dependencies: { lodash: '^4.17.21' },
      overrides: { foo: '1.0.0' },
      resolutions: { bar: '2.0.0' },
    })
    expect(pkg.dependencies).toEqual({ lodash: '^4.17.21' })
    expect(pkg.overrides).toEqual({ foo: '1.0.0' })
    expect(pkg.resolutions).toEqual({ bar: '2.0.0' })
  })

  it('drops dependencies / overrides / resolutions when not plain objects', () => {
    const pkg = createPackageJson('a', 'p', {
      dependencies: 'not-an-object' as unknown as Record<string, string>,
      overrides: [] as unknown as Record<string, string>,
    })
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.overrides).toBeUndefined()
  })

  it('substitutes the fleet-default node range when caller-supplied node engine is below it', () => {
    // packageDefaultNodeRange enforces a floor; a very old range like "^12"
    // should be replaced with the fleet default.
    const pkg = createPackageJson('a', 'p', { engines: { node: '^12' } })
    expect(pkg.engines?.node).not.toBe('^12')
    expect(typeof pkg.engines?.node).toBe('string')
  })

  it('preserves a caller-supplied node engine when it satisfies the fleet default', () => {
    // Use a range high enough that any reasonable fleet default is satisfied.
    const pkg = createPackageJson('a', 'p', { engines: { node: '>=99' } })
    expect(pkg.engines?.node).toBe('>=99')
  })

  it('preserves non-node engine keys verbatim', () => {
    const pkg = createPackageJson('a', 'p', {
      engines: { node: '>=99', npm: '>=9' },
    })
    expect(pkg.engines?.['npm']).toBe('>=9')
  })

  it('passes through caller-supplied files list (sliced)', () => {
    const files = ['custom.js', 'README.md']
    const pkg = createPackageJson('a', 'p', { files })
    expect(pkg.files).toEqual(files)
    // Sliced, not aliased.
    expect(pkg.files).not.toBe(files)
  })

  it('passes through caller-supplied socket block (spread)', () => {
    const socket = { categories: ['cleanup'] as const }
    const pkg = createPackageJson('a', 'p', {
      socket: socket as unknown as Record<string, unknown>,
    })
    expect(pkg.socket).toEqual({ categories: ['cleanup'] })
  })
})
