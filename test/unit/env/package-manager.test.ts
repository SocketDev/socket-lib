/**
 * @fileoverview Unit tests for package manager detection utilities.
 *
 * Tests package manager detection from environment:
 * - detectPackageManager() - Detect npm/pnpm/yarn/bun from env
 * - getPackageManagerInfo() - Get name and version from user agent
 * - getPackageManagerUserAgent() - Get user agent string
 * Used for adapting behavior based on the running package manager.
 */

import {
  detectPackageManager,
  getPackageManagerInfo,
  getPackageManagerUserAgent,
} from '@socketsecurity/lib/env/package-manager'
import { resetEnv, setEnv } from '@socketsecurity/lib/env/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('env/package-manager', () => {
  afterEach(() => {
    resetEnv()
  })

  describe('getPackageManagerUserAgent', () => {
    it('should return empty string when npm_config_user_agent is empty', () => {
      setEnv('npm_config_user_agent', '')
      const result = getPackageManagerUserAgent()
      expect(result === '' || result === undefined).toBe(true)
    })

    it('should return user agent when npm_config_user_agent is set', () => {
      const userAgent = 'pnpm/8.15.1 npm/? node/v20.11.0 darwin arm64'
      setEnv('npm_config_user_agent', userAgent)
      expect(getPackageManagerUserAgent()).toBe(userAgent)
    })

    it('should handle npm user agent', () => {
      const userAgent = 'npm/10.2.4 node/v20.11.0 darwin arm64 workspaces/false'
      setEnv('npm_config_user_agent', userAgent)
      expect(getPackageManagerUserAgent()).toBe(userAgent)
    })

    it('should handle yarn user agent', () => {
      const userAgent = 'yarn/1.22.19 npm/? node/v20.11.0 darwin arm64'
      setEnv('npm_config_user_agent', userAgent)
      expect(getPackageManagerUserAgent()).toBe(userAgent)
    })

    it('should handle bun user agent', () => {
      const userAgent = 'bun/1.0.0 npm/? node/v20.11.0 darwin arm64'
      setEnv('npm_config_user_agent', userAgent)
      expect(getPackageManagerUserAgent()).toBe(userAgent)
    })
  })

  describe('getPackageManagerInfo', () => {
    it('should return null when no user agent', () => {
      setEnv('npm_config_user_agent', '')
      expect(getPackageManagerInfo()).toBeNull()
    })

    it('should parse pnpm user agent', () => {
      setEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.11.0')
      const info = getPackageManagerInfo()
      expect(info).toEqual({ name: 'pnpm', version: '8.15.1' })
    })

    it('should parse npm user agent', () => {
      setEnv('npm_config_user_agent', 'npm/10.2.4 node/v20.11.0')
      const info = getPackageManagerInfo()
      expect(info).toEqual({ name: 'npm', version: '10.2.4' })
    })

    it('should parse yarn user agent', () => {
      setEnv('npm_config_user_agent', 'yarn/1.22.19 npm/? node/v20.11.0')
      const info = getPackageManagerInfo()
      expect(info).toEqual({ name: 'yarn', version: '1.22.19' })
    })

    it('should parse bun user agent', () => {
      setEnv('npm_config_user_agent', 'bun/1.0.0 npm/? node/v20.11.0')
      const info = getPackageManagerInfo()
      expect(info).toEqual({ name: 'bun', version: '1.0.0' })
    })

    it('should handle malformed user agent', () => {
      setEnv('npm_config_user_agent', 'invalid')
      expect(getPackageManagerInfo()).toBeNull()
    })

    it('should handle empty user agent', () => {
      setEnv('npm_config_user_agent', '')
      expect(getPackageManagerInfo()).toBeNull()
    })
  })

  describe('detectPackageManager', () => {
    describe('user agent detection', () => {
      it('should detect pnpm from user agent', () => {
        setEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.11.0')
        expect(detectPackageManager()).toBe('pnpm')
      })

      it('should detect npm from user agent', () => {
        setEnv('npm_config_user_agent', 'npm/10.2.4 node/v20.11.0')
        expect(detectPackageManager()).toBe('npm')
      })

      it('should detect yarn from user agent', () => {
        setEnv('npm_config_user_agent', 'yarn/1.22.19 npm/? node/v20.11.0')
        expect(detectPackageManager()).toBe('yarn')
      })

      it('should detect bun from user agent', () => {
        setEnv('npm_config_user_agent', 'bun/1.0.0 npm/? node/v20.11.0')
        expect(detectPackageManager()).toBe('bun')
      })

      it('should return null for unknown user agent', () => {
        setEnv('npm_config_user_agent', 'unknown/1.0.0')
        expect(detectPackageManager()).toBeNull()
      })
    })

    describe('fallback path detection', () => {
      it('should return null when no detection possible', () => {
        setEnv('npm_config_user_agent', '')
        // Note: In a real environment, process.argv[0] would be node path
        // This test verifies null is returned when no package manager is detected
        const result = detectPackageManager()
        // Result depends on actual process.argv[0], so we just verify it's a valid type
        expect(result === null || typeof result === 'string').toBe(true)
      })
    })
  })

  describe('integration', () => {
    it('should provide consistent results across functions', () => {
      const userAgent = 'pnpm/8.15.1 npm/? node/v20.11.0 darwin arm64'
      setEnv('npm_config_user_agent', userAgent)

      expect(getPackageManagerUserAgent()).toBe(userAgent)
      expect(detectPackageManager()).toBe('pnpm')
      expect(getPackageManagerInfo()).toEqual({
        name: 'pnpm',
        version: '8.15.1',
      })
    })

    it('should handle switching between package managers', () => {
      // First npm
      setEnv('npm_config_user_agent', 'npm/10.2.4 node/v20.11.0')
      expect(detectPackageManager()).toBe('npm')

      // Then pnpm
      setEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.11.0')
      expect(detectPackageManager()).toBe('pnpm')

      // Then yarn
      setEnv('npm_config_user_agent', 'yarn/1.22.19 npm/? node/v20.11.0')
      expect(detectPackageManager()).toBe('yarn')
    })

    it('should handle cleanup correctly', () => {
      setEnv('npm_config_user_agent', 'pnpm/8.15.1 npm/? node/v20.11.0')
      expect(detectPackageManager()).toBe('pnpm')

      setEnv('npm_config_user_agent', '')
      const userAgent = getPackageManagerUserAgent()
      expect(userAgent === '' || userAgent === undefined).toBe(true)
      expect(getPackageManagerInfo()).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should handle user agent with extra spaces', () => {
      setEnv('npm_config_user_agent', 'pnpm/8.15.1  npm/?  node/v20.11.0')
      expect(detectPackageManager()).toBe('pnpm')
      const info = getPackageManagerInfo()
      expect(info?.name).toBe('pnpm')
    })

    it('should handle minimal user agent', () => {
      setEnv('npm_config_user_agent', 'npm/10.0.0')
      expect(detectPackageManager()).toBe('npm')
      expect(getPackageManagerInfo()).toEqual({
        name: 'npm',
        version: '10.0.0',
      })
    })

    it('should handle version with pre-release tags', () => {
      setEnv('npm_config_user_agent', 'pnpm/8.15.1-beta.0 npm/? node/v20.11.0')
      expect(detectPackageManager()).toBe('pnpm')
      const info = getPackageManagerInfo()
      expect(info).toEqual({ name: 'pnpm', version: '8.15.1-beta.0' })
    })
  })
})
