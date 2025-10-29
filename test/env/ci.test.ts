/**
 * @fileoverview Unit tests for CI environment variable getter.
 */

import { getCI } from '@socketsecurity/lib/env/ci'
import { resetEnv, setEnv } from '@socketsecurity/lib/env/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('env/ci', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('getCI', () => {
    it('should return true when CI is set to "true"', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('should return true when CI is set to "TRUE"', () => {
      setEnv('CI', 'TRUE')
      expect(getCI()).toBe(true)
    })

    it('should return true when CI is set to "1"', () => {
      setEnv('CI', '1')
      expect(getCI()).toBe(true)
    })

    it('should return true when CI is set to "yes"', () => {
      setEnv('CI', 'yes')
      expect(getCI()).toBe(true)
    })

    it('should return true when CI is set to "YES"', () => {
      setEnv('CI', 'YES')
      expect(getCI()).toBe(true)
    })

    it('should return false when CI is set to "false"', () => {
      setEnv('CI', 'false')
      expect(getCI()).toBe(false)
    })

    it('should return false when CI is set to "0"', () => {
      setEnv('CI', '0')
      expect(getCI()).toBe(false)
    })

    it('should return false when CI is set to "no"', () => {
      setEnv('CI', 'no')
      expect(getCI()).toBe(false)
    })

    it('should return false when CI is empty string', () => {
      setEnv('CI', '')
      expect(getCI()).toBe(false)
    })

    it('should handle mixed case true', () => {
      setEnv('CI', 'True')
      expect(getCI()).toBe(true)
    })

    it('should handle mixed case yes', () => {
      setEnv('CI', 'Yes')
      expect(getCI()).toBe(true)
    })

    it('should handle arbitrary strings as false', () => {
      setEnv('CI', 'maybe')
      expect(getCI()).toBe(false)
    })

    it('should handle updating CI value from false to true', () => {
      setEnv('CI', 'false')
      expect(getCI()).toBe(false)

      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('should handle updating CI value from true to false', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)

      setEnv('CI', 'false')
      expect(getCI()).toBe(false)
    })

    it('should handle consecutive reads', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
      expect(getCI()).toBe(true)
      expect(getCI()).toBe(true)
    })

    it('should handle numeric strings other than 1', () => {
      setEnv('CI', '2')
      expect(getCI()).toBe(false)

      setEnv('CI', '100')
      expect(getCI()).toBe(false)
    })

    it('should handle whitespace in values', () => {
      setEnv('CI', ' true ')
      expect(getCI()).toBe(false) // whitespace makes it not match

      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('should be case-insensitive for true', () => {
      setEnv('CI', 'tRuE')
      expect(getCI()).toBe(true)
    })

    it('should be case-insensitive for yes', () => {
      setEnv('CI', 'yEs')
      expect(getCI()).toBe(true)
    })

    it('should handle special characters', () => {
      setEnv('CI', 'true!')
      expect(getCI()).toBe(false)
    })

    it('should handle GitHub Actions CI', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('should handle GitLab CI', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('should handle CircleCI', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('should handle Travis CI', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })
  })
})
