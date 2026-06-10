/**
 * @file Unit tests for Socket ecosystem path utilities. Tests Socket-specific
 *   directory path getters for caching and storage:
 *
 *   - getSocketHomePath() / getSocketUserDir() - base ~/.socket directory
 *   - getSocketAppDir() - application directory
 *   - getSocketAppCacheDir() - app-level cache storage
 *   - getSocketAppCacheTtlDir() - TTL-based cache directory
 *   - getSocketCacacheDir() - cacache (content-addressable cache) directory
 *   - getSocketDlxDir() - dlx (name+version binary store) directory
 *   - getSocketStateDir() - _state (version-less persistent app state) directory
 *   - getSocketAppStateDir() / getSocketAppRuntimeDir() - per-app state + run/
 *     dir (daemon socket + lock) Tests validate path existence, normalization,
 *     cross-platform consistency, and aliasing. These paths are critical for
 *     Socket tool state management and caching strategies.
 */

import process from 'node:process'
import {
  getSocketAppCacheDir,
  getSocketAppCacheTtlDir,
  getSocketAppDir,
  getSocketAppRuntimeDir,
  getSocketAppStateDir,
  getSocketCacacheDir,
  getSocketDlxDir,
  getSocketHomePath,
  getSocketStateDir,
  getSocketUserDir,
} from '../../src/paths/socket'
import { describe, expect, it } from 'vitest'

describe('paths', () => {
  describe('getSocketHomePath', () => {
    it('should return the Socket home directory', () => {
      const result = getSocketHomePath()
      expect(result).toBeTruthy()
      expect(result).toContain('.socket')
      expect(typeof result).toBe('string')
    })

    it('should be an alias for getSocketUserDir', () => {
      const homePath = getSocketHomePath()
      const userDir = getSocketUserDir()
      expect(homePath).toBe(userDir)
    })

    it('should return normalized path', () => {
      const result = getSocketHomePath()
      expect(result).not.toContain('\\')
      if (process.platform === 'win32') {
        expect(result).toMatch(/^[A-Za-z]:\//)
      } else {
        expect(result).toMatch(/^\//)
      }
    })
  })

  describe('getSocketUserDir', () => {
    it('should return the Socket user directory', () => {
      const result = getSocketUserDir()
      expect(result).toBeTruthy()
      expect(result).toContain('.socket')
      expect(typeof result).toBe('string')
    })

    it('should end with .socket directory', () => {
      const result = getSocketUserDir()
      expect(result).toMatch(/\.socket$/)
    })

    it('should be absolute path', () => {
      const result = getSocketUserDir()
      if (process.platform === 'win32') {
        expect(result).toMatch(/^[A-Za-z]:\//)
      } else {
        expect(result).toMatch(/^\//)
      }
    })

    it('should use forward slashes', () => {
      const result = getSocketUserDir()
      expect(result).not.toContain('\\')
    })
  })

  describe('getSocketAppDir', () => {
    it('should return app directory with underscore prefix', () => {
      const result = getSocketAppDir('myapp')
      expect(result).toContain('.socket/_myapp')
    })

    it('should work with different app names', () => {
      const app1 = getSocketAppDir('app1')
      const app2 = getSocketAppDir('app2')
      expect(app1).toContain('_app1')
      expect(app2).toContain('_app2')
      expect(app1).not.toBe(app2)
    })

    it('should return normalized path', () => {
      const result = getSocketAppDir('test')
      expect(result).not.toContain('\\')
    })

    it('should handle empty app name', () => {
      const result = getSocketAppDir('')
      expect(result).toContain('.socket/_')
      expect(result).toMatch(/\/_$/)
    })

    it('should handle app name with special characters', () => {
      const result = getSocketAppDir('my-app.test')
      expect(result).toContain('_my-app.test')
    })

    it('should be under Socket user directory', () => {
      const userDir = getSocketUserDir()
      const appDir = getSocketAppDir('test')
      expect(appDir).toContain(userDir)
    })
  })

  describe('getSocketCacacheDir', () => {
    it('should return cacache directory', () => {
      const result = getSocketCacacheDir()
      expect(result).toContain('.socket/_cacache')
    })

    it('should return normalized path', () => {
      const result = getSocketCacacheDir()
      expect(result).not.toContain('\\')
    })

    it('should be under Socket user directory when env var not set', () => {
      const userDir = getSocketUserDir()
      const cacacheDir = getSocketCacacheDir()
      expect(cacacheDir).toContain(userDir)
    })
  })

  describe('getSocketDlxDir', () => {
    it('should return DLX directory', () => {
      const result = getSocketDlxDir()
      expect(result).toContain('.socket/_dlx')
    })

    it('should return normalized path', () => {
      const result = getSocketDlxDir()
      expect(result).not.toContain('\\')
    })

    it('should be under Socket user directory', () => {
      const userDir = getSocketUserDir()
      const dlxDir = getSocketDlxDir()
      expect(dlxDir).toContain(userDir)
    })
  })

  describe('getSocketAppCacheDir', () => {
    it('should return app cache directory', () => {
      const result = getSocketAppCacheDir('myapp')
      expect(result).toContain('.socket/_myapp/cache')
    })

    it('should be under app directory', () => {
      const appDir = getSocketAppDir('test')
      const cacheDir = getSocketAppCacheDir('test')
      expect(cacheDir).toContain(appDir)
      expect(cacheDir).toMatch(/cache$/)
    })

    it('should return normalized path', () => {
      const result = getSocketAppCacheDir('test')
      expect(result).not.toContain('\\')
    })

    it('should work with different app names', () => {
      const cache1 = getSocketAppCacheDir('app1')
      const cache2 = getSocketAppCacheDir('app2')
      expect(cache1).toContain('_app1/cache')
      expect(cache2).toContain('_app2/cache')
      expect(cache1).not.toBe(cache2)
    })

    it('should handle empty app name', () => {
      const result = getSocketAppCacheDir('')
      expect(result).toContain('.socket/_/cache')
    })
  })

  describe('getSocketAppCacheTtlDir', () => {
    it('should return app TTL cache directory', () => {
      const result = getSocketAppCacheTtlDir('myapp')
      expect(result).toContain('.socket/_myapp/cache/ttl')
    })

    it('should be under app cache directory', () => {
      const cacheDir = getSocketAppCacheDir('test')
      const ttlDir = getSocketAppCacheTtlDir('test')
      expect(ttlDir).toContain(cacheDir)
      expect(ttlDir).toMatch(/ttl$/)
    })

    it('should return normalized path', () => {
      const result = getSocketAppCacheTtlDir('test')
      expect(result).not.toContain('\\')
    })

    it('should work with different app names', () => {
      const ttl1 = getSocketAppCacheTtlDir('app1')
      const ttl2 = getSocketAppCacheTtlDir('app2')
      expect(ttl1).toContain('_app1/cache/ttl')
      expect(ttl2).toContain('_app2/cache/ttl')
      expect(ttl1).not.toBe(ttl2)
    })

    it('should handle empty app name', () => {
      const result = getSocketAppCacheTtlDir('')
      expect(result).toContain('.socket/_/cache/ttl')
    })
  })

  describe('getSocketStateDir', () => {
    it('should return the _state infra directory', () => {
      const result = getSocketStateDir()
      expect(result).toContain('.socket/_state')
    })

    it('should return normalized path', () => {
      const result = getSocketStateDir()
      expect(result).not.toContain('\\')
    })

    it('should be under Socket user directory', () => {
      const userDir = getSocketUserDir()
      const stateDir = getSocketStateDir()
      expect(stateDir).toContain(userDir)
    })
  })

  describe('getSocketAppStateDir', () => {
    it('should nest the app inside _state', () => {
      const result = getSocketAppStateDir('proteus')
      expect(result).toContain('.socket/_state/proteus')
    })

    it('should nest under the _state dir', () => {
      const result = getSocketAppStateDir('proteus')
      expect(result).toMatch(/\/_state\/proteus$/)
    })
  })

  describe('getSocketAppRuntimeDir', () => {
    it('should return the app run/ dir under _state', () => {
      const result = getSocketAppRuntimeDir('proteus')
      expect(result).toContain('.socket/_state/proteus/run')
    })

    it('should end with the app state dir + /run', () => {
      const runDir = getSocketAppRuntimeDir('proteus')
      expect(runDir).toMatch(/\/_state\/proteus\/run$/)
    })

    it('should return normalized path', () => {
      const result = getSocketAppRuntimeDir('proteus')
      expect(result).not.toContain('\\')
    })
  })

  describe('path hierarchy', () => {
    it('should maintain correct directory hierarchy', () => {
      const userDir = getSocketUserDir()
      const appDir = getSocketAppDir('test')
      const cacheDir = getSocketAppCacheDir('test')
      const ttlDir = getSocketAppCacheTtlDir('test')

      // User dir should be the base
      expect(appDir).toContain(userDir)
      expect(cacheDir).toContain(userDir)
      expect(ttlDir).toContain(userDir)

      // Cache dir should be under app dir
      expect(cacheDir).toContain(appDir)

      // TTL dir should be under cache dir
      expect(ttlDir).toContain(cacheDir)
    })

    it('should have consistent path structure', () => {
      const paths = [
        getSocketUserDir(),
        getSocketAppDir('test'),
        getSocketCacacheDir(),
        getSocketDlxDir(),
        getSocketStateDir(),
        getSocketAppStateDir('test'),
        getSocketAppCacheDir('test'),
        getSocketAppCacheTtlDir('test'),
        getSocketAppRuntimeDir('test'),
      ]

      // All paths should be non-empty strings
      for (let i = 0, { length } = paths; i < length; i += 1) {
        const path = paths[i]!
        expect(typeof path).toBe('string')
        expect(path.length).toBeGreaterThan(0)
      }

      // All paths should use forward slashes (normalized)
      for (let i = 0, { length } = paths; i < length; i += 1) {
        const path = paths[i]!
        expect(path).not.toContain('\\')
      }

      // All paths should contain .socket
      for (let i = 0, { length } = paths; i < length; i += 1) {
        const path = paths[i]!
        expect(path).toContain('.socket')
      }
    })

    it('should generate unique paths for different apps', () => {
      const app1Dir = getSocketAppDir('app1')
      const app2Dir = getSocketAppDir('app2')
      const app1Cache = getSocketAppCacheDir('app1')
      const app2Cache = getSocketAppCacheDir('app2')

      expect(app1Dir).not.toBe(app2Dir)
      expect(app1Cache).not.toBe(app2Cache)
    })
  })

  describe('cross-platform compatibility', () => {
    it('should handle home directory correctly on different platforms', () => {
      const userDir = getSocketUserDir()

      if (process.platform === 'win32') {
        // Windows paths should have drive letter and forward slashes after normalization
        expect(userDir).toMatch(/^[A-Za-z]:\//)
        expect(userDir).not.toContain('\\')
      } else {
        // Unix-like paths should start with /
        expect(userDir).toMatch(/^\//)
      }
    })

    it('should return absolute paths on all platforms', () => {
      const paths = [
        getSocketUserDir(),
        getSocketAppDir('test'),
        getSocketCacacheDir(),
        getSocketDlxDir(),
      ]

      for (let i = 0, { length } = paths; i < length; i += 1) {
        const path = paths[i]!
        if (process.platform === 'win32') {
          expect(path).toMatch(/^[A-Za-z]:\//)
        } else {
          expect(path).toMatch(/^\//)
        }
      }
    })

    it('should not contain backslashes in normalized paths', () => {
      const paths = [
        getSocketUserDir(),
        getSocketAppDir('test'),
        getSocketCacacheDir(),
        getSocketDlxDir(),
        getSocketAppCacheDir('test'),
        getSocketAppCacheTtlDir('test'),
      ]

      for (let i = 0, { length } = paths; i < length; i += 1) {
        const path = paths[i]!
        expect(path).not.toContain('\\')
      }
    })
  })

  describe('edge cases', () => {
    it('should handle app names with various characters', () => {
      const testCases = [
        'simple',
        'with-dash',
        'with.dot',
        'with_underscore',
        'MixedCase',
        '123numeric',
      ]

      for (let i = 0, { length } = testCases; i < length; i += 1) {
        const appName = testCases[i]!
        const result = getSocketAppDir(appName)
        expect(result).toContain(`_${appName}`)
        expect(result).toContain('.socket')
      }
    })

    it('should handle empty string app name gracefully', () => {
      const result = getSocketAppDir('')
      expect(result).toContain('.socket/_')
      expect(typeof result).toBe('string')
    })

    it('should return consistent results on multiple calls', () => {
      const call1 = getSocketUserDir()
      const call2 = getSocketUserDir()
      const call3 = getSocketUserDir()

      expect(call1).toBe(call2)
      expect(call2).toBe(call3)
    })

    it('should return consistent results for same app name', () => {
      const call1 = getSocketAppDir('test')
      const call2 = getSocketAppDir('test')
      const call3 = getSocketAppDir('test')

      expect(call1).toBe(call2)
      expect(call2).toBe(call3)
    })
  })

  describe('specific app directories', () => {
    it('should generate correct app directory from a bare name', () => {
      const cliDir = getSocketAppDir('socket')
      expect(cliDir).toContain('_socket')
      expect(cliDir).toMatch(/\/_socket$/)
    })

    it('should generate correct state directory', () => {
      const stateDir = getSocketStateDir()
      expect(stateDir).toContain('_state')
      expect(stateDir).toMatch(/\/_state$/)
    })

    it('should generate correct DLX directory', () => {
      const dlxDir = getSocketDlxDir()
      expect(dlxDir).toContain('_dlx')
      expect(dlxDir).toMatch(/\/_dlx$/)
    })

    it('should generate correct cacache directory', () => {
      const cacacheDir = getSocketCacacheDir()
      expect(cacacheDir).toContain('_cacache')
      expect(cacacheDir).toMatch(/\/_cacache$/)
    })
  })
})
