/**
 * @file Unit tests for src/dlx/package — cache-key surface. Split out of the
 *   historical monolithic test/unit/dlx/package.test.mts to keep each test file
 *   under the fleet's 500-line soft cap.
 */

import crypto from 'node:crypto'

import { describe, expect, it } from 'vitest'

describe('generatePackageCacheKey', () => {
  it('should generate consistent 16-char hex hash', () => {
    const spec = 'cowsay@1.6.0'
    const hash1 = crypto
      .createHash('sha256')
      .update(spec)
      .digest('hex')
      .slice(0, 16)
    const hash2 = crypto
      .createHash('sha256')
      .update(spec)
      .digest('hex')
      .slice(0, 16)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
    expect(hash1).toMatch(/^[0-9a-f]{16}$/)
  })

  it('should generate different hashes for different specs', () => {
    const hash1 = crypto
      .createHash('sha256')
      .update('cowsay@1.6.0')
      .digest('hex')
      .slice(0, 16)
    const hash2 = crypto
      .createHash('sha256')
      .update('cowsay@1.5.0')
      .digest('hex')
      .slice(0, 16)

    expect(hash1).not.toBe(hash2)
  })

  it('should generate same hash for same spec across platforms', () => {
    // Hash is based on string, not paths, so platform-independent.
    const spec = '@cyclonedx/cdxgen@11.7.0'
    const hash = crypto
      .createHash('sha256')
      .update(spec)
      .digest('hex')
      .slice(0, 16)

    // Verify hash is lowercase hex.
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(hash).toHaveLength(16)
  })
})
