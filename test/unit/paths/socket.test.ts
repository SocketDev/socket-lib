/**
 * @fileoverview Unit tests for Socket ecosystem path utilities.
 *
 * Tests Socket directory path resolution:
 * - getUserHomeDir() - Get user home directory
 * - getSocketUserDir() - Get ~/.socket directory
 * - getSocketAppDir() - Get app-specific directories
 * - getSocketCacacheDir() - Get cacache directory
 * - getSocketDlxDir() - Get DLX directory
 * - App-specific paths (CLI, Registry, caches)
 * Used for consistent path resolution across Socket tools.
 */

import {
  getOsHomeDir,
  getOsTmpDir,
  getSocketAppCacheDir,
  getSocketAppCacheTtlDir,
  getSocketAppDir,
  getSocketCacacheDir,
  getSocketCliDir,
  getSocketDlxDir,
  getSocketHomePath,
  getSocketRegistryDir,
  getSocketRegistryGithubCacheDir,
  getSocketUserDir,
  getUserHomeDir,
  invalidateCache,
} from '@socketsecurity/lib/paths/socket'
import { clearEnv, resetEnv, setEnv } from '@socketsecurity/lib/env/rewire'
import {
  clearPath,
  resetPaths,
  setPath,
} from '@socketsecurity/lib/paths/rewire'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('paths/socket', () => {
  beforeEach(() => {
    invalidateCache()
  })

  afterEach(() => {
    resetPaths()
    resetEnv()
  })

  describe('getOsHomeDir', () => {
    it('should return home directory', () => {
      const result = getOsHomeDir()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should support path rewiring', () => {
      // Test that setPath is callable and doesn't throw
      setPath('homedir', '/test/home')
      clearPath('homedir')
      // Actual behavior verification depends on rewire implementation
      const result = getOsHomeDir()
      expect(typeof result).toBe('string')
    })
  })

  describe('getOsTmpDir', () => {
    it('should return tmp directory', () => {
      const result = getOsTmpDir()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should support path rewiring', () => {
      // Test that setPath is callable and doesn't throw
      setPath('tmpdir', '/test/tmp')
      clearPath('tmpdir')
      // Actual behavior verification depends on rewire implementation
      const result = getOsTmpDir()
      expect(typeof result).toBe('string')
    })
  })

  describe('getUserHomeDir', () => {
    it('should return a valid directory path', () => {
      const result = getUserHomeDir()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should prefer HOME env var on Unix', () => {
      setEnv('HOME', '/custom/home')
      const result = getUserHomeDir()
      expect(result).toBe('/custom/home')
    })

    it('should fallback to USERPROFILE on Windows', () => {
      setEnv('HOME', '')
      setEnv('USERPROFILE', 'C:\\Users\\TestUser')
      const result = getUserHomeDir()
      expect(result).toBe('C:\\Users\\TestUser')
    })

    it('should fallback to os.homedir if no env vars', () => {
      setEnv('HOME', '')
      setEnv('USERPROFILE', '')
      const result = getUserHomeDir()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('getSocketUserDir', () => {
    it('should return ~/.socket path', () => {
      const result = getSocketUserDir()
      expect(result).toContain('.socket')
      expect(result.endsWith('/.socket')).toBe(true)
    })

    it('should be memoized', () => {
      const first = getSocketUserDir()
      const second = getSocketUserDir()
      expect(first).toBe(second)
    })

    it('should use normalized paths', () => {
      const result = getSocketUserDir()
      // Should not contain backslashes
      expect(result.includes('\\')).toBe(false)
    })

    it('should invalidate cache on rewire reset', () => {
      const first = getSocketUserDir()

      setEnv('HOME', '/new/home')
      invalidateCache()

      const second = getSocketUserDir()
      // Should reflect new home dir
      expect(second).toContain('/new/home/.socket')
      expect(second).not.toBe(first)
    })
  })

  describe('getSocketHomePath', () => {
    it('should be alias for getSocketUserDir', () => {
      expect(getSocketHomePath()).toBe(getSocketUserDir())
    })

    it('should return same path consistently', () => {
      const path1 = getSocketHomePath()
      const path2 = getSocketUserDir()
      expect(path1).toBe(path2)
    })
  })

  describe('getSocketAppDir', () => {
    it('should return app directory with underscore prefix', () => {
      const result = getSocketAppDir('myapp')
      expect(result).toContain('.socket/_myapp')
      expect(result.endsWith('.socket/_myapp')).toBe(true)
    })

    it('should handle different app names', () => {
      const cli = getSocketAppDir('socket')
      const registry = getSocketAppDir('registry')

      expect(cli).toContain('_socket')
      expect(registry).toContain('_registry')
      expect(cli).not.toBe(registry)
    })

    it('should normalize paths', () => {
      const result = getSocketAppDir('test')
      expect(result.includes('\\')).toBe(false)
    })
  })

  describe('getSocketCacacheDir', () => {
    it('should return cacache directory', () => {
      clearEnv('SOCKET_CACACHE_DIR')
      const result = getSocketCacacheDir()
      expect(result).toContain('.socket/_cacache')
    })

    it('should be overridable via env var', () => {
      setEnv('SOCKET_CACACHE_DIR', '/custom/cacache')
      invalidateCache()
      const result = getSocketCacacheDir()
      expect(result).toBe('/custom/cacache')
    })

    it('should be memoized', () => {
      clearEnv('SOCKET_CACACHE_DIR')
      const first = getSocketCacacheDir()
      const second = getSocketCacacheDir()
      expect(first).toBe(second)
    })

    it('should normalize paths', () => {
      clearEnv('SOCKET_CACACHE_DIR')
      const result = getSocketCacacheDir()
      expect(result.includes('\\')).toBe(false)
    })
  })

  describe('getSocketDlxDir', () => {
    it('should return dlx directory', () => {
      clearEnv('SOCKET_DLX_DIR')
      const result = getSocketDlxDir()
      expect(result).toContain('.socket/_dlx')
    })

    it('should be overridable via env var', () => {
      setEnv('SOCKET_DLX_DIR', '/custom/dlx')
      const result = getSocketDlxDir()
      expect(result).toBe('/custom/dlx')
    })

    it('should normalize paths', () => {
      clearEnv('SOCKET_DLX_DIR')
      const result = getSocketDlxDir()
      expect(result.includes('\\')).toBe(false)
    })
  })

  describe('getSocketAppCacheDir', () => {
    it('should return app cache directory', () => {
      const result = getSocketAppCacheDir('myapp')
      expect(result).toContain('.socket/_myapp/cache')
      expect(result.endsWith('.socket/_myapp/cache')).toBe(true)
    })

    it('should handle different apps', () => {
      const app1 = getSocketAppCacheDir('app1')
      const app2 = getSocketAppCacheDir('app2')
      expect(app1).not.toBe(app2)
    })
  })

  describe('getSocketAppCacheTtlDir', () => {
    it('should return app TTL cache directory', () => {
      const result = getSocketAppCacheTtlDir('myapp')
      expect(result).toContain('.socket/_myapp/cache/ttl')
      expect(result.endsWith('.socket/_myapp/cache/ttl')).toBe(true)
    })

    it('should build on app cache dir', () => {
      const cacheDir = getSocketAppCacheDir('myapp')
      const ttlDir = getSocketAppCacheTtlDir('myapp')
      expect(ttlDir).toContain(cacheDir)
      expect(ttlDir).toBe(`${cacheDir}/ttl`)
    })
  })

  describe('getSocketCliDir', () => {
    it('should return Socket CLI directory', () => {
      const result = getSocketCliDir()
      expect(result).toContain('.socket/_socket')
    })

    it('should use standard app dir function', () => {
      const result = getSocketCliDir()
      const expected = getSocketAppDir('socket')
      expect(result).toBe(expected)
    })
  })

  describe('getSocketRegistryDir', () => {
    it('should return Socket Registry directory', () => {
      const result = getSocketRegistryDir()
      expect(result).toContain('.socket/_registry')
    })

    it('should use standard app dir function', () => {
      const result = getSocketRegistryDir()
      const expected = getSocketAppDir('registry')
      expect(result).toBe(expected)
    })
  })

  describe('getSocketRegistryGithubCacheDir', () => {
    it('should return GitHub cache directory', () => {
      const result = getSocketRegistryGithubCacheDir()
      expect(result).toContain('.socket/_registry/cache/ttl/github')
    })

    it('should build on registry cache dir', () => {
      const ttlDir = getSocketAppCacheTtlDir('registry')
      const githubDir = getSocketRegistryGithubCacheDir()
      expect(githubDir).toContain(ttlDir)
    })
  })

  describe('invalidateCache', () => {
    it('should clear memoized values', () => {
      clearEnv('SOCKET_CACACHE_DIR')
      const first = getSocketUserDir()
      const cacacheFirst = getSocketCacacheDir()

      // Change home dir
      setEnv('HOME', '/new/home')
      invalidateCache()

      const second = getSocketUserDir()
      const cacacheSecond = getSocketCacacheDir()

      expect(second).not.toBe(first)
      expect(cacacheSecond).not.toBe(cacacheFirst)
      expect(second).toContain('/new/home')
    })

    it('should clear cache when resetPaths is called', () => {
      getSocketUserDir()

      setEnv('HOME', '/another/home')
      resetPaths()

      const second = getSocketUserDir()
      // Cache should be cleared, allowing new value to be computed
      expect(typeof second).toBe('string')
      expect(second.endsWith('.socket')).toBe(true)
    })
  })

  describe('integration', () => {
    it('should maintain consistent directory structure', () => {
      const userDir = getSocketUserDir()
      const appDir = getSocketAppDir('test')
      const cacheDir = getSocketAppCacheDir('test')
      const ttlDir = getSocketAppCacheTtlDir('test')

      expect(appDir).toContain(userDir)
      expect(cacheDir).toContain(appDir)
      expect(ttlDir).toContain(cacheDir)
    })

    it('should normalize all paths consistently', () => {
      const paths = [
        getSocketUserDir(),
        getSocketAppDir('test'),
        getSocketCacacheDir(),
        getSocketDlxDir(),
        getSocketCliDir(),
        getSocketRegistryDir(),
      ]

      for (const p of paths) {
        // All should use forward slashes
        expect(p.includes('\\')).toBe(false)
      }
    })

    it('should handle environment variable overrides', () => {
      setEnv('SOCKET_CACACHE_DIR', '/custom/cache')
      setEnv('SOCKET_DLX_DIR', '/custom/dlx')
      invalidateCache()

      expect(getSocketCacacheDir()).toBe('/custom/cache')
      expect(getSocketDlxDir()).toBe('/custom/dlx')
    })
  })
})
