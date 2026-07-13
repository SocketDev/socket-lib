import { describe, expect, it } from 'vitest'

import {
  filterVersions,
  maxVersion,
  minVersion,
  satisfiesVersion,
} from '../../../src/versions/range'

describe('versions/range — filterVersions', () => {
  it('filters versions by range', () => {
    const versions = ['1.0.0', '1.5.0', '2.0.0', '2.5.0', '3.0.0']
    expect(filterVersions(versions, '>=2.0.0')).toEqual([
      '2.0.0',
      '2.5.0',
      '3.0.0',
    ])
    expect(filterVersions(versions, '^1.0.0')).toEqual(['1.0.0', '1.5.0'])
    expect(filterVersions(versions, '~2.0.0')).toEqual(['2.0.0'])
  })

  it('returns empty array when no versions match', () => {
    const versions = ['1.0.0', '1.5.0']
    expect(filterVersions(versions, '>=2.0.0')).toEqual([])
  })
})

describe('versions/range — maxVersion / minVersion', () => {
  it('finds maximum version', () => {
    const versions = ['1.0.0', '2.5.0', '1.9.0', '2.0.0']
    expect(maxVersion(versions)).toBe('2.5.0')
  })

  it('returns undefined for empty array on maxVersion', () => {
    expect(maxVersion([])).toBeUndefined()
  })

  it('finds minimum version', () => {
    const versions = ['1.0.0', '2.5.0', '1.9.0', '2.0.0']
    expect(minVersion(versions)).toBe('1.0.0')
  })

  it('returns undefined for empty array on minVersion', () => {
    expect(minVersion([])).toBeUndefined()
  })
})

describe('versions/range — satisfiesVersion', () => {
  it('checks if version satisfies range', () => {
    expect(satisfiesVersion('1.5.0', '>=1.0.0')).toBe(true)
    expect(satisfiesVersion('1.5.0', '^1.0.0')).toBe(true)
    expect(satisfiesVersion('1.5.0', '~1.5.0')).toBe(true)
    expect(satisfiesVersion('1.5.0', '>=2.0.0')).toBe(false)
  })
})
