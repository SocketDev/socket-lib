/**
 * @file Unit tests for default Node.js version range.
 */

import { describe, expect, it } from 'vitest'

// EXPECTED only. lib-stable is an independent oracle a test may compare
// against; it is never the ACTUAL, which must come from src/ or dist/. Its
// subpath stays under `constants/` because that is where the PUBLISHED package
// exports it — it moves here once this rename ships.
import { packageDefaultNodeRange as canonicalPackageDefaultNodeRange } from '@socketsecurity/lib-stable/constants/package-default-node-range'

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
