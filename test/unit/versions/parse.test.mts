import { describe, expect, it } from 'vitest'

import {
  coerceVersion,
  getMajorVersion,
  getMinorVersion,
  getPatchVersion,
  isValidVersion,
  parseVersion,
} from '../../../src/versions/parse'

describe('versions/parse — coerceVersion', () => {
  it('coerces version strings', () => {
    expect(coerceVersion('1')).toBe('1.0.0')
    expect(coerceVersion('1.2')).toBe('1.2.0')
    expect(coerceVersion('v1.2.3')).toBe('1.2.3')
  })

  it('returns undefined for invalid versions', () => {
    expect(coerceVersion('invalid')).toBeUndefined()
  })
})

describe('versions/parse — getMajorVersion / getMinorVersion / getPatchVersion', () => {
  it('extracts major version', () => {
    expect(getMajorVersion('1.2.3')).toBe(1)
    expect(getMajorVersion('5.0.0')).toBe(5)
    expect(getMajorVersion('10.20.30')).toBe(10)
  })

  it('returns undefined for invalid major', () => {
    expect(getMajorVersion('invalid')).toBeUndefined()
  })

  it('extracts minor version', () => {
    expect(getMinorVersion('1.2.3')).toBe(2)
    expect(getMinorVersion('5.7.0')).toBe(7)
    expect(getMinorVersion('10.20.30')).toBe(20)
  })

  it('returns undefined for invalid minor', () => {
    expect(getMinorVersion('invalid')).toBeUndefined()
  })

  it('extracts patch version', () => {
    expect(getPatchVersion('1.2.3')).toBe(3)
    expect(getPatchVersion('5.7.9')).toBe(9)
    expect(getPatchVersion('10.20.30')).toBe(30)
  })

  it('returns undefined for invalid patch', () => {
    expect(getPatchVersion('invalid')).toBeUndefined()
  })
})

describe('versions/parse — isValidVersion', () => {
  it('validates version strings', () => {
    expect(isValidVersion('1.0.0')).toBe(true)
    expect(isValidVersion('1.2.3')).toBe(true)
    expect(isValidVersion('1.0.0-alpha')).toBe(true)
    expect(isValidVersion('invalid')).toBe(false)
    expect(isValidVersion('1')).toBe(false)
  })
})

describe('versions/parse — parseVersion', () => {
  it('parses version components', () => {
    const parsed = parseVersion('1.2.3')
    expect(parsed).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
      build: [],
    })
  })

  it('parses version with prerelease', () => {
    const parsed = parseVersion('1.2.3-alpha.1')
    expect(parsed?.major).toBe(1)
    expect(parsed?.minor).toBe(2)
    expect(parsed?.patch).toBe(3)
    expect(parsed?.prerelease).toEqual(['alpha', 1])
  })

  it('returns undefined for invalid version', () => {
    expect(parseVersion('invalid')).toBeUndefined()
  })
})
