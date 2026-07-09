/**
 * @file Unit tests for `getReleaseTag` in package spec parsing — extracting
 *   the version/dist-tag suffix from an npm package specifier (scoped and
 *   unscoped, semver ranges, dist-tags, build metadata).
 */

import { describe, expect, it } from 'vitest'

import { getReleaseTag } from '../../../src/packages/specs'

describe('packages/specs — getReleaseTag', () => {
  it('should return empty string for empty spec', () => {
    expect(getReleaseTag('')).toBe('')
  })

  it('should extract tag from unscoped package', () => {
    expect(getReleaseTag('package@1.0.0')).toBe('1.0.0')
  })

  it('should extract tag from scoped package', () => {
    expect(getReleaseTag('@scope/package@1.0.0')).toBe('1.0.0')
  })

  it('should return empty string for package without tag', () => {
    expect(getReleaseTag('package')).toBe('')
  })

  it('should return empty string for scoped package without tag', () => {
    expect(getReleaseTag('@scope/package')).toBe('')
  })

  it('should handle multiple @ signs in scoped packages', () => {
    expect(getReleaseTag('@scope/package@latest')).toBe('latest')
    expect(getReleaseTag('@scope/package@^1.2.3')).toBe('^1.2.3')
  })

  it('should handle semver ranges', () => {
    expect(getReleaseTag('package@^1.2.3')).toBe('^1.2.3')
    expect(getReleaseTag('package@~1.2.3')).toBe('~1.2.3')
    expect(getReleaseTag('package@>=1.0.0')).toBe('>=1.0.0')
  })

  it('should handle dist-tags', () => {
    expect(getReleaseTag('package@latest')).toBe('latest')
    expect(getReleaseTag('package@next')).toBe('next')
    expect(getReleaseTag('@scope/package@beta')).toBe('beta')
  })

  it('should handle getReleaseTag with special characters', () => {
    expect(getReleaseTag('package@1.0.0-beta.1')).toBe('1.0.0-beta.1')
    expect(getReleaseTag('package@1.0.0+build.123')).toBe('1.0.0+build.123')
  })

  it('getReleaseTag returns a string for package spec', () => {
    const tag = getReleaseTag('package@1.0.0')
    expect(typeof tag).toBe('string')
  })

  it('should handle release tag extraction for various formats', () => {
    const testCases = [
      { input: 'pkg@1.0.0', expected: '1.0.0' },
      { input: '@scope/pkg@1.0.0', expected: '1.0.0' },
      { input: 'pkg@latest', expected: 'latest' },
      { input: '@scope/pkg@next', expected: 'next' },
      { input: 'pkg', expected: '' },
      { input: '@scope/pkg', expected: '' },
    ]

    for (let i = 0, { length } = testCases; i < length; i += 1) {
      const { expected, input } = testCases[i]!
      expect(getReleaseTag(input)).toBe(expected)
    }
  })
})
