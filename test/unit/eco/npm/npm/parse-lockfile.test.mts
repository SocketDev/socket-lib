/**
 * @fileoverview Unit tests for src/eco/npm/npm/parse-lockfile.ts.
 *
 * Exercises v1 (recursive `dependencies`) and v2/v3 (flat `packages`)
 * parser branches, plus error + edge-case behavior.
 */

import { describe, expect, it } from 'vitest'

import { ManifestError } from '@socketsecurity/lib-stable/eco/manifest/manifest-error'
import { parsePackageLock } from '@socketsecurity/lib-stable/eco/npm/npm/parse-lockfile'

describe('eco/npm/npm/parse-lockfile', () => {
  describe('v2/v3', () => {
    it('parses a minimal v3 lockfile', () => {
      const result = parsePackageLock(
        JSON.stringify({
          name: 'app',
          lockfileVersion: 3,
          packages: {
            '': { name: 'app', version: '1.0.0' },
            'node_modules/lodash': {
              version: '4.17.21',
              resolved:
                'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
              integrity: 'sha512-deadbeef',
            },
          },
        }),
      )

      expect(result.type).toBe('lockfile')
      expect(result.lockVersion).toBe('3')
      expect(result.ecosystem).toBe('npm')
      expect(result.packages).toHaveLength(1)
      expect(result.packages[0]).toMatchObject({
        name: 'lodash',
        version: '4.17.21',
        resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
        integrity: 'sha512-deadbeef',
        depType: 'prod',
        isDev: false,
      })
    })

    it('tags dep flavors correctly', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'node_modules/a': { version: '1.0.0', dev: true },
            'node_modules/b': { version: '1.0.0', optional: true },
            'node_modules/c': { version: '1.0.0', peer: true },
          },
        }),
      )
      const byName = new Map(result.packages.map(p => [p.name, p]))
      expect(byName.get('a')!.depType).toBe('dev')
      expect(byName.get('b')!.depType).toBe('optional')
      expect(byName.get('c')!.depType).toBe('peer')
    })

    it('extracts git VCS metadata from resolved', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'node_modules/foo': {
              version: '0.0.0',
              resolved: 'git+https://github.com/x/foo.git#abc123',
            },
          },
        }),
      )
      expect(result.packages[0]).toMatchObject({
        vcsUrl: 'git+https://github.com/x/foo.git',
        vcsCommit: 'abc123',
      })
    })

    it('handles scoped packages in nested node_modules paths', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'node_modules/a/node_modules/@scope/b': { version: '1.0.0' },
          },
        }),
      )
      expect(result.packages[0]!.name).toBe('@scope/b')
    })
  })

  describe('v1', () => {
    it('flattens nested dependencies', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 1,
          dependencies: {
            a: {
              version: '1.0.0',
              dependencies: {
                b: { version: '2.0.0' },
              },
            },
          },
        }),
      )
      const names = result.packages.map(p => p.name).sort()
      expect(names).toEqual(['a', 'b'])
    })

    it('terminates on circular dependencies', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 1,
          dependencies: {
            a: {
              version: '1.0.0',
              dependencies: {
                b: {
                  version: '2.0.0',
                  dependencies: {
                    a: { version: '1.0.0' },
                  },
                },
              },
            },
          },
        }),
      )
      expect(result.packages.map(p => p.name).sort()).toEqual(['a', 'b'])
    })

    it('extracts real name + version from npm: aliased installs', () => {
      // npm v1 lockfiles encode aliased deps as
      // `version: "npm:<real-name>@<real-version>"`. The component
      // should reference the real registry package, not the alias.
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 1,
          dependencies: {
            'string-width-cjs': {
              version: 'npm:string-width@4.2.3',
              resolved:
                'https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz',
            },
          },
        }),
      )
      const sw = result.packages.find(p => p.name === 'string-width')!
      expect(sw.version).toBe('4.2.3')
    })
  })

  describe('v2/v3 workspaces + alias', () => {
    it('prefers pkg.name for workspace path entries', () => {
      // Workspace entries are keyed by their relative path (no
      // `node_modules/` prefix). Use the explicit `pkg.name` field
      // instead of the path-derived fallback.
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'packages/ui': {
              name: '@my-org/ui',
              version: '0.0.0',
            },
            'node_modules/regular-dep': { version: '1.0.0' },
          },
        }),
      )
      const ws = result.packages.find(p => p.name === '@my-org/ui')!
      expect(ws.version).toBe('0.0.0')
      const reg = result.packages.find(p => p.name === 'regular-dep')!
      expect(reg.version).toBe('1.0.0')
    })

    it('prefers pkg.name for aliased v2/v3 entries', () => {
      // npm v2/v3 writes aliased installs as
      //   "node_modules/<alias>": { name: "<real>", version: "..." }
      // — use `pkg.name` so the component is keyed by the real name.
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'node_modules/sw-cjs': {
              name: 'string-width',
              version: '4.2.3',
            },
          },
        }),
      )
      expect(result.packages.map(p => p.name)).toEqual(['string-width'])
    })
  })

  describe('errors + edge cases', () => {
    it('throws ManifestError(ERR_INVALID_JSON) on bad JSON', () => {
      try {
        parsePackageLock('not json')
        expect.fail('should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(ManifestError)
        expect((e as ManifestError).code).toBe('ERR_INVALID_JSON')
      }
    })

    it('returns an empty lockfile shape when neither packages nor dependencies present', () => {
      const result = parsePackageLock(JSON.stringify({ lockfileVersion: 3 }))
      expect(result.packages).toEqual([])
      expect(result.lockVersion).toBe('3')
    })

    it('caps v1 recursion depth and throws RangeError', () => {
      // Build a 70-level deep nested dependencies structure.
      let inner: Record<string, unknown> = {
        deepest: { version: '1.0.0' },
      }
      for (let i = 69; i >= 0; i--) {
        inner = { [`lvl${i}`]: { version: '1.0.0', dependencies: inner } }
      }
      const content = JSON.stringify({
        lockfileVersion: 1,
        dependencies: inner,
      })
      expect(() => parsePackageLock(content)).toThrow(RangeError)
    })

    it('promotes a 3-occurrence v2/v3 entry into a [n, n, n] index', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            'node_modules/a': { version: '1.0.0' },
            'node_modules/x/node_modules/a': { version: '2.0.0' },
            'node_modules/y/node_modules/a': { version: '3.0.0' },
          },
        }),
      )
      const idxEntry = (result._index as { a?: unknown })['a']
      expect(idxEntry).toEqual([0, 1, 2])
    })

    it('freezes the result and packages list', () => {
      const result = parsePackageLock(
        JSON.stringify({
          lockfileVersion: 3,
          packages: { 'node_modules/x': { version: '1.0.0' } },
        }),
      )
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.packages)).toBe(true)
      expect(Object.isFrozen(result.packages[0])).toBe(true)
    })
  })
})
