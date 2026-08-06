/**
 * @file Unit tests for CI environment variable getter. Tests isCI() which
 *   detects CI/CD environments via the CI environment variable. Returns true
 *   when the CI key exists in the environment, regardless of value. Returns
 *   false only when CI is unset/undefined. Uses rewire for test isolation
 *   (setEnv/clearEnv/resetEnv) without polluting process.env. Critical for
 *   conditional behavior in CI environments (GitHub Actions, GitLab CI, etc.).
 */

import { isCI } from '../../../src/env/ci'
import { clearEnv, resetEnv, setEnv } from '../../../src/env/rewire'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('env/ci', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('isCI', () => {
    it('should return true when CI is set to "true"', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "TRUE"', () => {
      setEnv('CI', 'TRUE')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "1"', () => {
      setEnv('CI', '1')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "yes"', () => {
      setEnv('CI', 'yes')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "YES"', () => {
      setEnv('CI', 'YES')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "false"', () => {
      setEnv('CI', 'false')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "0"', () => {
      setEnv('CI', '0')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is set to "no"', () => {
      setEnv('CI', 'no')
      expect(isCI()).toBe(true)
    })

    it('should return true when CI is empty string', () => {
      setEnv('CI', '')
      expect(isCI()).toBe(true)
    })

    it('should handle mixed case true', () => {
      setEnv('CI', 'True')
      expect(isCI()).toBe(true)
    })

    it('should handle mixed case yes', () => {
      setEnv('CI', 'Yes')
      expect(isCI()).toBe(true)
    })

    it('should handle arbitrary strings as true', () => {
      setEnv('CI', 'maybe')
      expect(isCI()).toBe(true)
    })

    it('should handle updating CI value (all remain true when key exists)', () => {
      setEnv('CI', 'false')
      expect(isCI()).toBe(true)

      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })

    it('should return false when CI is cleared', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)

      // On CI systems, process.env.CI exists, so stub it out first
      vi.stubEnv('CI', undefined)
      clearEnv('CI')
      expect(isCI()).toBe(false)
      vi.unstubAllEnvs()
    })

    it('should handle consecutive reads', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
      expect(isCI()).toBe(true)
      expect(isCI()).toBe(true)
    })

    it('should handle numeric strings other than 1', () => {
      setEnv('CI', '2')
      expect(isCI()).toBe(true)

      setEnv('CI', '100')
      expect(isCI()).toBe(true)
    })

    it('should handle whitespace in values', () => {
      setEnv('CI', ' true ')
      expect(isCI()).toBe(true) // any value means CI exists

      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })

    it('should be case-insensitive for true', () => {
      setEnv('CI', 'tRuE')
      expect(isCI()).toBe(true)
    })

    it('should be case-insensitive for yes', () => {
      setEnv('CI', 'yEs')
      expect(isCI()).toBe(true)
    })

    it('should handle special characters', () => {
      setEnv('CI', 'true!')
      expect(isCI()).toBe(true)
    })

    it('should handle GitHub Actions CI', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })

    it('should handle GitLab CI', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })

    it('should handle CircleCI', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })

    it('should handle Travis CI', () => {
      setEnv('CI', 'true')
      expect(isCI()).toBe(true)
    })
  })
})
