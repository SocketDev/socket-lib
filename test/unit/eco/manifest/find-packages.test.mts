/**
 * @file Unit tests for findPackages.
 */

import { describe, expect, it } from 'vitest'

import {
  FIND_PACKAGES_PATTERN_MAX_LEN,
  findPackages,
} from '../../../../src/eco/manifest/find-packages'
import { parsePackageLock } from '../../../../src/eco/npm/npm/parse-lockfile'

const LOCK = parsePackageLock(
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/lodash': { version: '4.17.21' },
      'node_modules/loose-envify': { version: '1.4.0' },
      'node_modules/uuid': { version: '9.0.1' },
    },
  }),
)

describe('eco/manifest/find-packages', () => {
  it('matches against string patterns', () => {
    const result = findPackages(LOCK, '^l')
    const names = result.map(p => p.name).toSorted()
    expect(names).toEqual(['lodash', 'loose-envify'])
  })

  it('matches against RegExp patterns', () => {
    const result = findPackages(LOCK, /lo/)
    expect(result.map(p => p.name).toSorted()).toEqual([
      'lodash',
      'loose-envify',
    ])
  })

  it('returns an empty array when nothing matches', () => {
    expect(findPackages(LOCK, '^zzz')).toEqual([])
  })

  it('rejects non-string non-RegExp patterns', () => {
    expect(() => findPackages(LOCK, 42 as unknown as string)).toThrow(TypeError)
  })

  it('caps string pattern length to FIND_PACKAGES_PATTERN_MAX_LEN', () => {
    expect(() =>
      findPackages(LOCK, 'a'.repeat(FIND_PACKAGES_PATTERN_MAX_LEN + 1)),
    ).toThrow(RangeError)
  })

  it('caps RegExp source length to FIND_PACKAGES_PATTERN_MAX_LEN', () => {
    const longSource = 'a'.repeat(FIND_PACKAGES_PATTERN_MAX_LEN + 1)
    expect(() => findPackages(LOCK, new RegExp(longSource))).toThrow(RangeError)
  })
})
