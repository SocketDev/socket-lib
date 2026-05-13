/**
 * @fileoverview Unit tests for src/eco/npm/npm/parse-lockfile.ts.
 *
 * Exercises v1 (recursive `dependencies`) and v2/v3 (flat `packages`)
 * parser branches, plus error + edge-case behavior.
 */

import { describe, expect, it } from 'vitest'

import { ManifestError } from '@socketsecurity/lib/eco/manifest/manifest-error'
import { parsePackageLock } from '@socketsecurity/lib/eco/npm/npm/parse-lockfile'

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
