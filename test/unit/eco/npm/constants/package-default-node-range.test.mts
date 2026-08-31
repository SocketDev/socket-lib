/**
 * @file Unit tests for default Node.js version range.
 */

import { describe, expect, it } from 'vitest'

// The BUILT artifact, not the published package. lib-stable is for helpers;
// a parity test must compare src/ against the dist/ this repo produces, or it
// measures whatever was last released instead of what this checkout builds.
import { packageDefaultNodeRange as canonicalPackageDefaultNodeRange } from '../../../../../dist/eco/npm/constants/package-default-node-range.js'

import { packageDefaultNodeRange } from '../../../../../src/eco/npm/constants/package-default-node-range.mjs'

describe('package-default-node-range', () => {
  it('should export a string', () => {
    expect(typeof packageDefaultNodeRange).toBe('string')
  })

  it('should start with >= operator', () => {
    expect(packageDefaultNodeRange).toMatch(/^>=/)
  })

  it('should contain a major version number', () => {
    expect(packageDefaultNodeRange).toMatch(/^>=\d+$/)
  })

  it('should be a valid semver range format', () => {
    // Extract the version number
    const versionMatch = packageDefaultNodeRange.match(/^>=(\d+)$/)
    expect(versionMatch).not.toBeNull()
    if (versionMatch) {
      const majorVersion = Number.parseInt(versionMatch[1]!, 10)
      expect(majorVersion).toBeGreaterThan(0)
      expect(majorVersion).toBeLessThan(100) // Sanity check
    }
  })

  it('should be based on maintained Node versions', () => {
    // The value should be a reasonable Node.js version
    // As of 2025, maintained versions are typically >= 18
    const versionMatch = packageDefaultNodeRange.match(/^>=(\d+)$/)
    if (versionMatch) {
      const majorVersion = Number.parseInt(versionMatch[1]!, 10)
      expect(majorVersion).toBeGreaterThanOrEqual(18)
    }
  })

  it('should not have trailing spaces', () => {
    expect(packageDefaultNodeRange).toBe(
      canonicalPackageDefaultNodeRange.trim(),
    )
  })

  it('should not be empty', () => {
    expect(packageDefaultNodeRange.length).toBeGreaterThan(0)
  })
})
