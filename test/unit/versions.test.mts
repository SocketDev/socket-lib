/**
 * @file Unit tests for semantic version comparison and manipulation utilities.
 *   Tests version utility functions:
 *
 *   - Comparison: compare(), gt(), lt(), eq()
 *   - Extraction: getMajorVersion(), getMinorVersion(), getPatchVersion()
 *   - Manipulation: incrementVersion(), coerceVersion()
 *   - Filtering: filterVersions(), maxVersion(), minVersion()
 *   - Validation: isValidVersion() for semver format checking Used by Socket
 *     tools for Node.js version checking and dependency version management.
 */

import {
  compare,
  eq,
  gt,
  gte,
  lt,
  lte,
  sort,
  rsort,
} from '../../src/versions/compare'
import {
  incrementVersion,
  versionDiff,
} from '../../src/versions/modify'
import {
  coerceVersion,
  getMajorVersion,
  getMinorVersion,
  getPatchVersion,
  isValidVersion,
  parseVersion,
} from '../../src/versions/parse'
import {
  filterVersions,
  maxVersion,
  minVersion,
  satisfiesVersion,
} from '../../src/versions/range'
import { describe, expect, it } from 'vitest'

describe('versions', () => {
  describe('coerceVersion', () => {
    it('should coerce version strings', () => {
      expect(coerceVersion('1')).toBe('1.0.0')
      expect(coerceVersion('1.2')).toBe('1.2.0')
      expect(coerceVersion('v1.2.3')).toBe('1.2.3')
    })

    it('should return undefined for invalid versions', () => {
      expect(coerceVersion('invalid')).toBeUndefined()
    })
  })

  describe('compare', () => {
    it('should compare equal versions', () => {
      expect(compare('1.0.0', '1.0.0')).toBe(0)
    })

    it('should return -1 when first is less than second', () => {
      expect(compare('1.0.0', '2.0.0')).toBe(-1)
      expect(compare('1.0.0', '1.1.0')).toBe(-1)
      expect(compare('1.0.0', '1.0.1')).toBe(-1)
    })

    it('should return 1 when first is greater than second', () => {
      expect(compare('2.0.0', '1.0.0')).toBe(1)
      expect(compare('1.1.0', '1.0.0')).toBe(1)
      expect(compare('1.0.1', '1.0.0')).toBe(1)
    })

    it('should return undefined for invalid versions', () => {
      expect(compare('invalid', '1.0.0')).toBeUndefined()
      expect(compare('1.0.0', 'invalid')).toBeUndefined()
    })
  })

  describe('filterVersions', () => {
    it('should filter versions by range', () => {
      const versions = ['1.0.0', '1.5.0', '2.0.0', '2.5.0', '3.0.0']
      expect(filterVersions(versions, '>=2.0.0')).toEqual([
        '2.0.0',
        '2.5.0',
        '3.0.0',
      ])
      expect(filterVersions(versions, '^1.0.0')).toEqual(['1.0.0', '1.5.0'])
      expect(filterVersions(versions, '~2.0.0')).toEqual(['2.0.0'])
    })

    it('should return empty array when no versions match', () => {
      const versions = ['1.0.0', '1.5.0']
      expect(filterVersions(versions, '>=2.0.0')).toEqual([])
    })
  })

  describe('getMajorVersion', () => {
    it('should extract major version', () => {
      expect(getMajorVersion('1.2.3')).toBe(1)
      expect(getMajorVersion('5.0.0')).toBe(5)
      expect(getMajorVersion('10.20.30')).toBe(10)
    })

    it('should return undefined for invalid versions', () => {
      expect(getMajorVersion('invalid')).toBeUndefined()
    })
  })

  describe('getMinorVersion', () => {
    it('should extract minor version', () => {
      expect(getMinorVersion('1.2.3')).toBe(2)
      expect(getMinorVersion('5.7.0')).toBe(7)
      expect(getMinorVersion('10.20.30')).toBe(20)
    })

    it('should return undefined for invalid versions', () => {
      expect(getMinorVersion('invalid')).toBeUndefined()
    })
  })

  describe('getPatchVersion', () => {
    it('should extract patch version', () => {
      expect(getPatchVersion('1.2.3')).toBe(3)
      expect(getPatchVersion('5.7.9')).toBe(9)
      expect(getPatchVersion('10.20.30')).toBe(30)
    })

    it('should return undefined for invalid versions', () => {
      expect(getPatchVersion('invalid')).toBeUndefined()
    })
  })

  describe('incrementVersion', () => {
    it('should increment major version', () => {
      expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
    })

    it('should increment minor version', () => {
      expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
    })

    it('should increment patch version', () => {
      expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
    })

    it('should increment prerelease', () => {
      expect(incrementVersion('1.2.3-alpha.0', 'prerelease')).toBe(
        '1.2.3-alpha.1',
      )
    })

    it('should return undefined for invalid versions', () => {
      expect(incrementVersion('invalid', 'major')).toBeUndefined()
    })
  })

  describe('eq', () => {
    it('should check version equality', () => {
      expect(eq('1.0.0', '1.0.0')).toBe(true)
      expect(eq('1.0.0', '1.0.1')).toBe(false)
    })
  })

  describe('gt', () => {
    it('should check if first version is greater', () => {
      expect(gt('2.0.0', '1.0.0')).toBe(true)
      expect(gt('1.0.0', '2.0.0')).toBe(false)
      expect(gt('1.0.0', '1.0.0')).toBe(false)
    })
  })

  describe('gte', () => {
    it('should check if first version is greater or equal', () => {
      expect(gte('2.0.0', '1.0.0')).toBe(true)
      expect(gte('1.0.0', '1.0.0')).toBe(true)
      expect(gte('1.0.0', '2.0.0')).toBe(false)
    })
  })

  describe('lt', () => {
    it('should check if first version is less', () => {
      expect(lt('1.0.0', '2.0.0')).toBe(true)
      expect(lt('2.0.0', '1.0.0')).toBe(false)
      expect(lt('1.0.0', '1.0.0')).toBe(false)
    })
  })

  describe('lte', () => {
    it('should check if first version is less or equal', () => {
      expect(lte('1.0.0', '2.0.0')).toBe(true)
      expect(lte('1.0.0', '1.0.0')).toBe(true)
      expect(lte('2.0.0', '1.0.0')).toBe(false)
    })
  })

  describe('isValidVersion', () => {
    it('should validate version strings', () => {
      expect(isValidVersion('1.0.0')).toBe(true)
      expect(isValidVersion('1.2.3')).toBe(true)
      expect(isValidVersion('1.0.0-alpha')).toBe(true)
      expect(isValidVersion('invalid')).toBe(false)
      expect(isValidVersion('1')).toBe(false)
    })
  })

  describe('maxVersion', () => {
    it('should find maximum version', () => {
      const versions = ['1.0.0', '2.5.0', '1.9.0', '2.0.0']
      expect(maxVersion(versions)).toBe('2.5.0')
    })

    it('should return undefined for empty array', () => {
      expect(maxVersion([])).toBeUndefined()
    })
  })

  describe('minVersion', () => {
    it('should find minimum version', () => {
      const versions = ['1.0.0', '2.5.0', '1.9.0', '2.0.0']
      expect(minVersion(versions)).toBe('1.0.0')
    })

    it('should return undefined for empty array', () => {
      expect(minVersion([])).toBeUndefined()
    })
  })

  describe('parseVersion', () => {
    it('should parse version components', () => {
      const parsed = parseVersion('1.2.3')
      expect(parsed).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: [],
        build: [],
      })
    })

    it('should parse version with prerelease', () => {
      const parsed = parseVersion('1.2.3-alpha.1')
      expect(parsed?.major).toBe(1)
      expect(parsed?.minor).toBe(2)
      expect(parsed?.patch).toBe(3)
      expect(parsed?.prerelease).toEqual(['alpha', 1])
    })

    it('should return undefined for invalid version', () => {
      expect(parseVersion('invalid')).toBeUndefined()
    })
  })

  describe('satisfiesVersion', () => {
    it('should check if version satisfies range', () => {
      expect(satisfiesVersion('1.5.0', '>=1.0.0')).toBe(true)
      expect(satisfiesVersion('1.5.0', '^1.0.0')).toBe(true)
      expect(satisfiesVersion('1.5.0', '~1.5.0')).toBe(true) // ~1.4.0 doesn't match 1.5.0
      expect(satisfiesVersion('1.5.0', '>=2.0.0')).toBe(false)
    })
  })

  describe('sort', () => {
    it('should sort versions in ascending order', () => {
      const versions = ['2.0.0', '1.0.0', '1.9.0', '1.5.0']
      expect(sort(versions)).toEqual(['1.0.0', '1.5.0', '1.9.0', '2.0.0'])
    })

    it('should not mutate original array', () => {
      const versions = ['2.0.0', '1.0.0']
      sort(versions)
      expect(versions).toEqual(['2.0.0', '1.0.0'])
    })
  })

  describe('rsort', () => {
    it('should sort versions in descending order', () => {
      const versions = ['1.0.0', '2.0.0', '1.5.0', '1.9.0']
      expect(rsort(versions)).toEqual(['2.0.0', '1.9.0', '1.5.0', '1.0.0'])
    })

    it('should not mutate original array', () => {
      const versions = ['1.0.0', '2.0.0']
      rsort(versions)
      expect(versions).toEqual(['1.0.0', '2.0.0'])
    })
  })

  describe('versionDiff', () => {
    it('should detect major diff', () => {
      expect(versionDiff('1.0.0', '2.0.0')).toBe('major')
    })

    it('should detect minor diff', () => {
      expect(versionDiff('1.0.0', '1.1.0')).toBe('minor')
    })

    it('should detect patch diff', () => {
      expect(versionDiff('1.0.0', '1.0.1')).toBe('patch')
    })

    it('should return undefined for equal versions', () => {
      expect(versionDiff('1.0.0', '1.0.0')).toBeUndefined()
    })

    it('should return undefined for invalid versions', () => {
      expect(versionDiff('invalid', '1.0.0')).toBeUndefined()
    })
  })
})
