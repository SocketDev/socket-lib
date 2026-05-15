/**
 * @fileoverview Unit tests for getPackage / getPackageVersions.
 */

import { describe, expect, it } from 'vitest'

import { getPackage } from '@socketsecurity/lib-stable/eco/manifest/get-package'
import { getPackageVersions } from '@socketsecurity/lib-stable/eco/manifest/get-package-versions'
import { parsePackageLock } from '@socketsecurity/lib-stable/eco/npm/npm/parse-lockfile'

const LOCK = parsePackageLock(
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0' },
      'node_modules/a/node_modules/a': { version: '2.0.0' },
    },
  }),
)

describe('eco/manifest/get-package', () => {
  it('returns the first matching entry (multi-version)', () => {
    const a = getPackage(LOCK, 'a')!
    expect(a.name).toBe('a')
  })

  it('returns the entry for a single-version name', () => {
    const b = getPackage(LOCK, 'b')!
    expect(b.name).toBe('b')
    expect(b.version).toBe('1.0.0')
  })

  it('returns undefined for an unknown name', () => {
    expect(getPackage(LOCK, 'nope')).toBe(undefined)
  })
})

describe('eco/manifest/get-package-versions', () => {
  it('returns all entries that share a name', () => {
    const versions = getPackageVersions(LOCK, 'a')
    expect(versions.map(v => v.version).sort()).toEqual(['1.0.0', '2.0.0'])
  })

  it('returns a singleton array for single-version names', () => {
    expect(getPackageVersions(LOCK, 'b')).toHaveLength(1)
  })

  it('returns an empty array for unknown names', () => {
    expect(getPackageVersions(LOCK, 'nope')).toEqual([])
  })
})
