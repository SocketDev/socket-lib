/**
 * @fileoverview Unit tests for src/eco/npm/parse-package-json.ts.
 *
 * On stock Node these exercise the JS impl; on the smol binary they
 * exercise `node:smol-manifest`. Both paths return the same shapes.
 */

import { describe, expect, it } from 'vitest'

import { ManifestError } from '@socketsecurity/lib-stable/eco/manifest/manifest-error'
import { parsePackageJson } from '@socketsecurity/lib-stable/eco/npm/parse-package-json'

describe('eco/npm/parse-package-json', () => {
  it('parses a minimal manifest', () => {
    const result = parsePackageJson(
      JSON.stringify({ name: 'foo', version: '1.0.0' }),
    )
    expect(result.type).toBe('manifest')
    expect(result.name).toBe('foo')
    expect(result.version).toBe('1.0.0')
    expect(result.ecosystem).toBe('npm')
    expect(result.dependencies).toEqual([])
  })

  it('returns undefined for missing optional fields', () => {
    const result = parsePackageJson(JSON.stringify({}))
    expect(result.name).toBe(undefined)
    expect(result.version).toBe(undefined)
    expect(result.description).toBe(undefined)
    expect(result.license).toBe(undefined)
    expect(result.repository).toBe(undefined)
  })

  it('captures dependencies by type', () => {
    const result = parsePackageJson(
      JSON.stringify({
        name: 'foo',
        dependencies: { a: '^1' },
        devDependencies: { b: '^2' },
        peerDependencies: { c: '^3' },
        optionalDependencies: { d: '^4' },
      }),
    )

    const byName = new Map(result.dependencies.map(d => [d.name, d]))

    expect(byName.get('a')).toMatchObject({
      name: 'a',
      versionRange: '^1',
      type: 'prod',
      optional: false,
    })
    expect(byName.get('b')).toMatchObject({
      type: 'dev',
      optional: false,
    })
    expect(byName.get('c')).toMatchObject({
      type: 'peer',
      optional: false,
    })
    expect(byName.get('d')).toMatchObject({
      type: 'optional',
      optional: true,
    })
  })

  it('extracts repository.url from object form', () => {
    const result = parsePackageJson(
      JSON.stringify({
        name: 'foo',
        repository: { type: 'git', url: 'git+https://example.com/foo.git' },
      }),
    )
    expect(result.repository).toBe('git+https://example.com/foo.git')
  })

  it('keeps repository as a string when given as a string', () => {
    const result = parsePackageJson(
      JSON.stringify({ name: 'foo', repository: 'github:owner/foo' }),
    )
    expect(result.repository).toBe('github:owner/foo')
  })

  it('throws ManifestError(ERR_INVALID_JSON) on bad JSON', () => {
    try {
      parsePackageJson('not json')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ManifestError)
      expect((e as ManifestError).code).toBe('ERR_INVALID_JSON')
    }
  })

  it('ignores non-object dependency containers', () => {
    const result = parsePackageJson(
      JSON.stringify({ name: 'foo', dependencies: 'oops' }),
    )
    expect(result.dependencies).toEqual([])
  })

  it('freezes the result shape', () => {
    const result = parsePackageJson(JSON.stringify({ name: 'foo' }))
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.dependencies)).toBe(true)
  })
})
