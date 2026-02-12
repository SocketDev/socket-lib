/**
 * @fileoverview Unit tests for environment variable rewiring system.
 *
 * Tests the rewire module that enables test-time environment variable overrides:
 * - setEnv() / clearEnv() - override env vars without modifying process.env
 * - resetEnv() - clear all overrides (use in afterEach)
 * - hasOverride() - check if an env var has a test override
 * Allows isolated env var testing without polluting global process.env state.
 * Critical for reliable, parallel test execution without env var conflicts.
 */

import { getCI } from '@socketsecurity/lib/env/ci'
import { getHome } from '@socketsecurity/lib/env/home'
import { getSocketDebug } from '@socketsecurity/lib/env/socket'
import {
  clearEnv,
  hasOverride,
  isInEnv,
  resetEnv,
  setEnv,
} from '@socketsecurity/lib/env/rewire'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('env rewiring', () => {
  // Clean up after each test to avoid state leakage
  afterEach(() => {
    resetEnv()
  })

  describe('setEnv() and clearEnv()', () => {
    it('should override environment variable', () => {
      // Set override
      setEnv('HOME', '/custom/home')

      expect(getHome()).toBe('/custom/home')
      expect(hasOverride('HOME')).toBe(true)
    })

    it('should clear override and return to real value', () => {
      const originalHome = process.env.HOME

      setEnv('HOME', '/custom/home')
      expect(getHome()).toBe('/custom/home')

      clearEnv('HOME')
      expect(getHome()).toBe(originalHome)
      expect(hasOverride('HOME')).toBe(false)
    })

    it('should override boolean env vars', () => {
      // Override CI to true
      setEnv('CI', '1')
      expect(getCI()).toBe(true)

      // CI with empty string still returns true (key exists)
      setEnv('CI', '')
      expect(getCI()).toBe(true)

      // CI returns false only when cleared
      clearEnv('CI')
      expect(getCI()).toBe(false)
    })

    it('should allow undefined overrides', () => {
      setEnv('SOCKET_DEBUG', undefined)
      expect(getSocketDebug()).toBeUndefined()
      expect(hasOverride('SOCKET_DEBUG')).toBe(true)
    })
  })

  describe('resetEnv()', () => {
    it('should clear all overrides', () => {
      setEnv('HOME', '/custom/home')
      setEnv('CI', '1')
      setEnv('SOCKET_DEBUG', 'test')

      expect(hasOverride('HOME')).toBe(true)
      expect(hasOverride('CI')).toBe(true)
      expect(hasOverride('SOCKET_DEBUG')).toBe(true)

      resetEnv()

      expect(hasOverride('HOME')).toBe(false)
      expect(hasOverride('CI')).toBe(false)
      expect(hasOverride('SOCKET_DEBUG')).toBe(false)
    })
  })

  describe.sequential('isolated test scenarios', () => {
    beforeEach(() => {
      resetEnv()
    })

    it('test 1: should run with CI=true', () => {
      setEnv('CI', 'true')
      expect(getCI()).toBe(true)
    })

    it('test 2: should run with CI cleared', () => {
      setEnv('CI', 'false')
      expect(getCI()).toBe(true) // Key exists, so true

      clearEnv('CI')
      expect(getCI()).toBe(false) // Key doesn't exist
    })

    it('test 3: should not be affected by previous tests', () => {
      // This test should see the real CI value, not overrides from previous tests
      expect(hasOverride('CI')).toBe(false)
    })
  })

  describe('real-world usage patterns', () => {
    it('should simulate CI environment for testing', () => {
      // Test code behavior in CI
      setEnv('CI', '1')
      setEnv('GITHUB_REPOSITORY', 'owner/repo')

      expect(getCI()).toBe(true)
      // Test code that behaves differently in CI...
    })

    it('should test with custom home directory', () => {
      setEnv('HOME', '/tmp/test-home')

      expect(getHome()).toBe('/tmp/test-home')
      // Test code that uses home directory...
    })

    it('should test debug mode behavior', () => {
      setEnv('SOCKET_DEBUG', 'socket:*')

      expect(getSocketDebug()).toBe('socket:*')
      // Test debug logging behavior...
    })
  })

  describe('multiple simultaneous overrides', () => {
    it('should handle multiple overrides independently', () => {
      setEnv('HOME', '/custom/home')
      setEnv('CI', '1')
      setEnv('SOCKET_DEBUG', 'test')

      expect(getHome()).toBe('/custom/home')
      expect(getCI()).toBe(true)
      expect(getSocketDebug()).toBe('test')

      // Clear one override
      clearEnv('CI')

      // Others remain
      expect(getHome()).toBe('/custom/home')
      expect(getSocketDebug()).toBe('test')
      // CI returns to real value
      expect(hasOverride('CI')).toBe(false)
    })
  })

  describe('isInEnv()', () => {
    it('should return true when key exists with truthy value', () => {
      setEnv('TEST_KEY', 'value')
      expect(isInEnv('TEST_KEY')).toBe(true)
    })

    it('should return true when key exists with empty string', () => {
      setEnv('TEST_KEY', '')
      expect(isInEnv('TEST_KEY')).toBe(true)
    })

    it('should return true when key exists with "false" string', () => {
      setEnv('TEST_KEY', 'false')
      expect(isInEnv('TEST_KEY')).toBe(true)
    })

    it('should return true when key exists with "0" string', () => {
      setEnv('TEST_KEY', '0')
      expect(isInEnv('TEST_KEY')).toBe(true)
    })

    it('should return false when key does not exist', () => {
      // Use a key that definitely doesn't exist
      expect(isInEnv('NONEXISTENT_KEY_12345')).toBe(false)
    })

    it('should return false when key is cleared', () => {
      setEnv('TEST_KEY', 'value')
      expect(isInEnv('TEST_KEY')).toBe(true)

      clearEnv('TEST_KEY')
      expect(isInEnv('TEST_KEY')).toBe(false)
    })

    it('should handle undefined values correctly', () => {
      setEnv('TEST_KEY', undefined)
      // undefined means the key is set but has no value
      expect(isInEnv('TEST_KEY')).toBe(true)
    })

    it('should check isolated overrides first', () => {
      // Set shared override
      setEnv('TEST_KEY', 'shared')
      expect(isInEnv('TEST_KEY')).toBe(true)

      // Shared override should still work
      clearEnv('TEST_KEY')
      expect(isInEnv('TEST_KEY')).toBe(false)
    })

    it('should work with real process.env values', () => {
      // PATH should exist in process.env
      expect(isInEnv('PATH')).toBe(true)
    })

    it('should detect keys added via vi.stubEnv', () => {
      vi.stubEnv('VITEST_STUBBED_KEY', 'stubbed-value')
      expect(isInEnv('VITEST_STUBBED_KEY')).toBe(true)
      vi.unstubAllEnvs()
    })

    it('should prioritize overrides over process.env', () => {
      // Set a value in process.env first
      vi.stubEnv('TEST_PRIORITY_KEY', 'process-env-value')
      expect(isInEnv('TEST_PRIORITY_KEY')).toBe(true)

      // Override should still be checked
      setEnv('TEST_PRIORITY_KEY', undefined)
      expect(isInEnv('TEST_PRIORITY_KEY')).toBe(true)

      clearEnv('TEST_PRIORITY_KEY')
      expect(isInEnv('TEST_PRIORITY_KEY')).toBe(true) // Falls back to process.env

      vi.unstubAllEnvs()
    })
  })
})
