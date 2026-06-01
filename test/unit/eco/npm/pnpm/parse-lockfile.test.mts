/**
 * @file Unit tests for src/eco/npm/pnpm/parse-lockfile.ts.
 */

import { describe, expect, it } from 'vitest'

import {
  addToPnpmIndex,
  freezeEntry,
  indentOf,
  newPnpmEntry,
  parsePnpmLock,
  stripPeerSuffix,
} from '../../../../../src/eco/npm/pnpm/parse-lockfile'

const PNPM_V5 = `lockfileVersion: 5.4

packages:

  /lodash/4.17.21:
    resolution: {integrity: sha512-aaaa, tarball: https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz}
    dev: false

  /@babel/core/7.23.0:
    resolution: {integrity: sha512-bbbb}
    dependencies:
      foo: 1.0.0
      bar: 2.0.0
    dev: true
`

const PNPM_V9 = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      lodash:
        specifier: ^4.17.0
        version: 4.17.21
    devDependencies:
      vitest:
        specifier: ^4.0.0
        version: 4.0.3

snapshots:

  lodash@4.17.21:
    resolution: {integrity: sha512-cccc}

  vitest@4.0.3:
    resolution: {integrity: sha512-dddd}
    dev: true
`

describe('eco/npm/pnpm/parse-lockfile', () => {
  describe('parsePnpmLock (v5)', () => {
    const result = parsePnpmLock(PNPM_V5)

    it('flags lockVersion as "5"', () => {
      expect(result.lockVersion).toBe('5')
    })

    it('captures both v5 entries', () => {
      const names = result.packages.map(p => p.name).toSorted()
      expect(names).toEqual(['@babel/core', 'lodash'])
    })

    it('extracts version + integrity + resolved from resolution map', () => {
      const lodash = result.packages.find(p => p.name === 'lodash')!
      expect(lodash.version).toBe('4.17.21')
      expect(lodash.integrity).toBe('sha512-aaaa')
      expect(lodash.resolved).toBe(
        'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
      )
    })

    it('tags dev: true entries as dev', () => {
      const babel = result.packages.find(p => p.name === '@babel/core')!
      expect(babel.depType).toBe('dev')
      expect(babel.isDev).toBe(true)
    })

    it('captures dependency-names of an entry', () => {
      const babel = result.packages.find(p => p.name === '@babel/core')!
      expect(babel.dependencies).toEqual(['foo', 'bar'])
    })
  })

  describe('parsePnpmLock (v9)', () => {
    const result = parsePnpmLock(PNPM_V9)

    it('flags lockVersion as "9"', () => {
      expect(result.lockVersion).toBe('9')
    })

    it('captures importer + snapshot entries together', () => {
      const names = result.packages.map(p => p.name).toSorted()
      expect(names).toContain('lodash')
      expect(names).toContain('vitest')
    })

    it('tags importer.devDependencies entries as dev', () => {
      const vitest = result.packages.find(p => p.name === 'vitest')!
      expect(vitest.isDev).toBe(true)
    })

    it('does NOT emit entries with empty version strings', () => {
      // pnpm v9 importer entries that use the block shape
      //   pkg:
      //     specifier: ^1
      //     version: 1.0.0
      // were previously emitted with an empty `version` for the parent
      // line. Verify every package now has a non-empty version.
      for (const pkg of result.packages) {
        expect(pkg.version).not.toBe('')
      }
    })

    it('skips workspace: + file: protocol versions in importers', () => {
      const lock = `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      ws-dep: workspace:^1.0.0\n      file-dep: file:./local.tgz\n      real-dep: 1.0.0\n`
      const r = parsePnpmLock(lock)
      const names = r.packages.map(p => p.name)
      expect(names).toContain('real-dep')
      expect(names).not.toContain('ws-dep')
      expect(names).not.toContain('file-dep')
    })
  })

  describe('edge cases', () => {
    it('returns zero packages for empty content', () => {
      const result = parsePnpmLock('')
      expect(result.packages).toEqual([])
    })

    it('returns zero packages for content with only the header', () => {
      const result = parsePnpmLock('lockfileVersion: 5.4\n')
      expect(result.packages).toEqual([])
    })

    it('does not throw on malformed yaml', () => {
      expect(() =>
        parsePnpmLock('packages:\n  /lodash/4.17.21:\n    resolution: '),
      ).not.toThrow()
    })

    it('captures package optional: true + integrity line', () => {
      const lock = `lockfileVersion: 5.4\n\npackages:\n\n  /optionalpkg/1.0.0:\n    integrity: sha512-optsum\n    optional: true\n`
      const result = parsePnpmLock(lock)
      const pkg = result.packages.find(p => p.name === 'optionalpkg')!
      expect(pkg.depType).toBe('optional')
      expect(pkg.isOptional).toBe(true)
      expect(pkg.integrity).toBe('sha512-optsum')
    })

    it('exits dependencies: block on sibling section header', () => {
      const lock = `lockfileVersion: 5.4\n\npackages:\n\n  /pkg/1.0.0:\n    dependencies:\n      real-dep: 1.0.0\n    peerDependencies:\n      a-peer: 1.0.0\n`
      const result = parsePnpmLock(lock)
      const pkg = result.packages.find(p => p.name === 'pkg')!
      // Only real-dep should be captured; a-peer must NOT leak in.
      expect(pkg.dependencies).toEqual(['real-dep'])
    })

    it('captures importer.optionalDependencies entries as optional', () => {
      const lock = `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    optionalDependencies:\n      fsevents: 2.3.3\n`
      const result = parsePnpmLock(lock)
      const fs = result.packages.find(p => p.name === 'fsevents')!
      expect(fs.depType).toBe('optional')
      expect(fs.isOptional).toBe(true)
    })

    it('skips workspace link: deps in importers (inline form)', () => {
      const lock = `lockfileVersion: '6.0'\n\nimporters:\n\n  .:\n    dependencies:\n      my-workspace: link:packages/my-workspace\n`
      const result = parsePnpmLock(lock)
      expect(
        result.packages.find(p => p.name === 'my-workspace'),
      ).toBeUndefined()
    })
  })

  describe('helpers', () => {
    it('indentOf counts leading spaces', () => {
      expect(indentOf('    foo')).toBe(4)
      expect(indentOf('\t\tfoo')).toBe(2)
      expect(indentOf('foo')).toBe(0)
    })

    it('stripPeerSuffix removes underscore suffix', () => {
      expect(stripPeerSuffix('1.0.0_peer-1')).toBe('1.0.0')
    })

    it('stripPeerSuffix removes paren suffix', () => {
      expect(stripPeerSuffix('1.0.0(foo@2)')).toBe('1.0.0')
    })

    it('stripPeerSuffix returns the version when clean', () => {
      expect(stripPeerSuffix('1.0.0')).toBe('1.0.0')
    })

    it('newPnpmEntry seeds a PnpmEntry with defaults', () => {
      const entry = newPnpmEntry('foo', '1.0.0')
      expect(entry.name).toBe('foo')
      expect(entry.version).toBe('1.0.0')
      expect(entry.depType).toBe('prod')
      expect(entry.dependencies).toEqual([])
    })

    it('freezeEntry strips _inDeps + freezes', () => {
      const entry = newPnpmEntry('foo', '1.0.0')
      entry._inDeps = true
      const ref = freezeEntry(entry)
      expect(Object.isFrozen(ref)).toBe(true)
      expect(
        (ref as unknown as { _inDeps?: boolean | undefined })._inDeps,
      ).toBe(undefined)
    })

    it('addToPnpmIndex builds singletons + multi-version arrays', () => {
      const idx = { __proto__: null } as unknown as Record<
        string,
        number | number[]
      >
      addToPnpmIndex(idx, 'lodash', 0)
      expect(idx['lodash']).toBe(0)
      addToPnpmIndex(idx, 'lodash', 1)
      expect(idx['lodash']).toEqual([0, 1])
      addToPnpmIndex(idx, 'lodash', 2)
      expect(idx['lodash']).toEqual([0, 1, 2])
    })
  })
})
