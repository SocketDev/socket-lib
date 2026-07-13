import { describe, expect, it } from 'vitest'

import { incrementVersion, versionDiff } from '../../../src/versions/modify'

describe('versions/modify — incrementVersion', () => {
  it('increments major version', () => {
    expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0')
  })

  it('increments minor version', () => {
    expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0')
  })

  it('increments patch version', () => {
    expect(incrementVersion('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('increments prerelease', () => {
    expect(incrementVersion('1.2.3-alpha.0', 'prerelease')).toBe(
      '1.2.3-alpha.1',
    )
  })

  it('returns undefined for invalid versions', () => {
    expect(incrementVersion('invalid', 'major')).toBeUndefined()
  })
})

describe('versions/modify — versionDiff', () => {
  it('detects major diff', () => {
    expect(versionDiff('1.0.0', '2.0.0')).toBe('major')
  })

  it('detects minor diff', () => {
    expect(versionDiff('1.0.0', '1.1.0')).toBe('minor')
  })

  it('detects patch diff', () => {
    expect(versionDiff('1.0.0', '1.0.1')).toBe('patch')
  })

  it('returns undefined for equal versions', () => {
    expect(versionDiff('1.0.0', '1.0.0')).toBeUndefined()
  })

  it('returns undefined for invalid versions', () => {
    expect(versionDiff('invalid', '1.0.0')).toBeUndefined()
  })
})
