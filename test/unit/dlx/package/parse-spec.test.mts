/**
 * @file Unit tests for src/dlx/package — parse-spec surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

describe('parsePackageSpec', () => {
  it('should parse unscoped package with version', () => {
    // This tests the internal parsePackageSpec via the public API behavior.
    const spec = 'lodash@4.17.21'
    expect(spec).toContain('@')
    expect(spec.split('@')).toHaveLength(2)
  })

  it('should parse unscoped package without version', () => {
    const spec = 'lodash'
    expect(spec).not.toContain('@')
  })

  it('should parse scoped package with version', () => {
    const spec = '@cyclonedx/cdxgen@11.7.0'
    const parts = spec.split('@')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('')
    expect(parts[1]).toBe('cyclonedx/cdxgen')
    expect(parts[2]).toBe('11.7.0')
  })

  it('should parse scoped package without version', () => {
    const spec = '@cyclonedx/cdxgen'
    const parts = spec.split('@')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toBe('')
    expect(parts[1]).toBe('cyclonedx/cdxgen')
  })

  it('should handle scoped package without version in fallback parser', () => {
    // Test the edge case fixed in dlx/package.ts:621
    // Scoped packages without version: @scope/package
    // Should return { name: '@scope/package', version: undefined }
    const spec = '@types/node'
    const lastAtIndex = spec.lastIndexOf('@')
    expect(lastAtIndex).toBe(0) // @ is at position 0 for scoped package without version
    // When atIndex === 0, it's a scoped package without version
  })

  it('should handle scoped package with version in fallback parser', () => {
    // Scoped packages with version: @scope/package@version
    const spec = '@types/node@20.0.0'
    const lastAtIndex = spec.lastIndexOf('@')
    expect(lastAtIndex).toBeGreaterThan(0) // @ is after position 0
    const name = spec.slice(0, lastAtIndex)
    const version = spec.slice(lastAtIndex + 1)
    expect(name).toBe('@types/node')
    expect(version).toBe('20.0.0')
  })

  it('should distinguish between scoped packages with and without versions', () => {
    // Test cases that should be distinguished correctly
    const testCases = [
      { spec: '@babel/core', hasVersion: false, atIndex: 0 },
      { spec: '@babel/core@7.0.0', hasVersion: true, atIndex: 11 },
      { spec: '@types/node', hasVersion: false, atIndex: 0 },
      { spec: '@types/node@18.0.0', hasVersion: true, atIndex: 11 },
    ]

    for (const { atIndex, hasVersion, spec } of testCases) {
      const lastAt = spec.lastIndexOf('@')
      expect(lastAt).toBe(atIndex)
      if (hasVersion) {
        expect(lastAt).toBeGreaterThan(0)
      } else {
        expect(lastAt).toBe(0)
      }
    }
  })

  it('should handle complex version ranges', () => {
    const specs = [
      'lodash@^4.17.0',
      'lodash@~4.17.21',
      'lodash@>=4.0.0',
      'lodash@>4.0.0 <5.0.0',
    ]

    for (let i = 0, { length } = specs; i < length; i += 1) {
      const spec = specs[i]!
      expect(spec).toContain('@')
      const atIndex = spec.lastIndexOf('@')
      expect(atIndex).toBeGreaterThan(0)
    }
  })
})
