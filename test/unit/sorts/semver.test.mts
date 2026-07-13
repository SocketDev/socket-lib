import { describe, expect, it } from 'vitest'

import { compareSemver } from '../../../src/sorts/semver'

describe('sorts/semver — compareSemver', () => {
  it('compares valid semantic versions', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })

  it('handles patch version differences', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('handles minor version differences', () => {
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0)
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0)
  })

  it('handles major version differences', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0)
  })

  it('handles pre-release versions', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
    expect(compareSemver('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    expect(compareSemver('1.0.0', '1.0.0-beta')).toBeGreaterThan(0)
  })

  it('handles invalid versions equally', () => {
    expect(compareSemver('invalid', 'also-invalid')).toBe(0)
    expect(compareSemver('not-semver', 'bad-version')).toBe(0)
  })

  it('handles invalid version less than valid', () => {
    expect(compareSemver('invalid', '1.0.0')).toBe(-1)
  })

  it('handles valid version greater than invalid', () => {
    expect(compareSemver('1.0.0', 'invalid')).toBe(1)
  })

  it('sorts versions correctly', () => {
    const arr = ['2.0.0', '1.1.0', '1.0.0', '1.0.1']
    const sorted = arr.slice().toSorted(compareSemver)
    expect(sorted).toEqual(['1.0.0', '1.0.1', '1.1.0', '2.0.0'])
  })

  it('handles versions with build metadata', () => {
    expect(compareSemver('1.0.0+build1', '1.0.0+build2')).toBe(0)
    expect(compareSemver('1.0.0+build', '1.0.0')).toBe(0)
  })

  it('handles multi-digit version numbers', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareSemver('10.0.0', '9.0.0')).toBeGreaterThan(0)
  })

  it('handles mixed valid and invalid versions', () => {
    const arr = ['2.0.0', 'invalid', '1.0.0', '1.5.0']
    const sorted = arr.slice().toSorted(compareSemver)
    expect(sorted[0]).toBe('invalid')
    expect(sorted.slice(1)).toEqual(['1.0.0', '1.5.0', '2.0.0'])
  })

  it('handles empty strings as invalid', () => {
    expect(compareSemver('', '')).toBe(0)
    expect(compareSemver('', '1.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '')).toBe(1)
  })
})
