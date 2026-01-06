/**
 * @fileoverview Unit tests for default Node.js version range.
 */

import { packageDefaultNodeRange } from '@socketsecurity/lib/constants/package-default-node-range'
import { describe, expect, it } from 'vitest'

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
      const majorVersion = Number.parseInt(versionMatch[1], 10)
      expect(majorVersion).toBeGreaterThan(0)
      expect(majorVersion).toBeLessThan(100) // Sanity check
    }
  })

  it('should be based on maintained Node versions', () => {
    // The value should be a reasonable Node.js version
    // As of 2025, maintained versions are typically >= 18
    const versionMatch = packageDefaultNodeRange.match(/^>=(\d+)$/)
    if (versionMatch) {
      const majorVersion = Number.parseInt(versionMatch[1], 10)
      expect(majorVersion).toBeGreaterThanOrEqual(18)
    }
  })

  it('should not have trailing spaces', () => {
    expect(packageDefaultNodeRange).toBe(packageDefaultNodeRange.trim())
  })

  it('should not be empty', () => {
    expect(packageDefaultNodeRange.length).toBeGreaterThan(0)
  })
})
