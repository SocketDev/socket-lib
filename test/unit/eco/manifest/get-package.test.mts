/**
 * @file Unit tests for getPackage / getPackageVersions.
 */

import { describe, expect, it } from 'vitest'

import { getPackage } from '../../../../src/eco/manifest/get-package.mjs'
import { getPackageVersions } from '../../../../src/eco/manifest/get-package-versions.mjs'
import { parsePackageLock } from '../../../../src/eco/npm/npm-cli/lockfile/parse.mjs'

const LOCK = parsePackageLock(
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/alpha': { version: '1.0.0' },
      'node_modules/beta': { version: '1.0.0' },
      'node_modules/alpha/node_modules/alpha': { version: '2.0.0' },
    },
  }),
)

describe('eco/manifest/get-package', () => {
  it('returns the first matching entry (multi-version)', () => {
    const alpha = getPackage(LOCK, 'alpha')!
    expect(alpha.name).toBe('alpha')
  })

  it('returns the entry for a single-version name', () => {
    const beta = getPackage(LOCK, 'beta')!
    expect(beta.name).toBe('beta')
    expect(beta.version).toBe('1.0.0')
  })

  it('returns undefined for an unknown name', () => {
    expect(getPackage(LOCK, 'nope')).toBe(undefined)
  })
})

describe('eco/manifest/get-package-versions', () => {
  it('returns all entries that share a name', () => {
    const versions = getPackageVersions(LOCK, 'alpha')
    expect(versions.map(v => v.version).toSorted()).toEqual(['1.0.0', '2.0.0'])
  })

  it('returns a singleton array for single-version names', () => {
    expect(getPackageVersions(LOCK, 'beta')).toHaveLength(1)
  })

  it('returns an empty array for unknown names', () => {
    expect(getPackageVersions(LOCK, 'nope')).toEqual([])
  })

  it('returns empty array when single-number index points past packages', () => {
    const forged = {
      type: 'lockfile' as const,
      lockVersion: '3',
      ecosystem: 'npm' as const,
      packages: [],
      _index: { ghost: 5 },
    }
    const result = getPackageVersions(
      forged as unknown as Parameters<typeof getPackageVersions>[0],
      'ghost',
    )
    expect(result).toEqual([])
  })

  it('skips out-of-bounds index entries in array form', () => {
    const forged = {
      type: 'lockfile' as const,
      lockVersion: '3',
      ecosystem: 'npm' as const,
      packages: [],
      _index: { ghost: [99] as readonly number[] },
    }
    const result = getPackageVersions(
      forged as unknown as Parameters<typeof getPackageVersions>[0],
      'ghost',
    )
    expect(result).toEqual([])
  })
})
