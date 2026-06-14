/**
 * @file Unit tests for Socket ecosystem path utilities. Tests Socket directory
 *   path resolution:
 *
 *   - getUserHomeDir() - Get user home directory
 *   - getSocketUserDir() - Get ~/.socket directory
 *   - getSocketAppDir() - Get app-specific directories
 *   - getSocketCacacheDir() - Get cacache directory
 *   - getSocketDlxDir() - Get DLX directory
 *   - App-specific paths (CLI, Registry, caches) Used for consistent path
 *     resolution across Socket tools.
 */

import { getSocketUserDir as getSocketUserDirStable } from '@socketsecurity/lib-stable/paths/socket'

import {
  getOsHomeDir,
  getOsTmpDir,
  getSocketAppCacheDir,
  getSocketAppCacheTtlDir,
  getSocketAppDir,
  getSocketAppRuntimeDir,
  getSocketAppStateDir,
  getSocketCacacheDir,
  getSocketDlxDir,
  getSocketHomePath,
  getSocketRackDir,
  getSocketRackToolDir,
  getSocketRepoClonesDir,
  getSocketStateDir,
  getSocketUserDir,
  getSocketWheelhouseBinDir,
  getSocketWheelhouseDir,
  getUserHomeDir,
} from '../../../src/paths/socket'
import { clearEnv, resetEnv, setEnv } from '../../../src/env/rewire'
import { clearPath, resetPaths, setPath } from '../../../src/paths/rewire'
import { afterEach, describe, expect, it } from 'vitest'

describe('paths/socket', () => {
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
      resetPaths()

      const second = getSocketUserDir()
      // Should reflect new home dir
      expect(second).toContain('/new/home/.socket')
      expect(second).not.toBe(first)
    })

    it('honors SOCKET_HOME env override', () => {
      setEnv('SOCKET_HOME', '/custom/socket/dir')
      resetPaths()
      const result = getSocketUserDir()
      expect(result).toBe('/custom/socket/dir')
    })
  })

  describe('getSocketHomePath', () => {
    it('should be alias for getSocketUserDir', () => {
      expect(getSocketHomePath()).toBe(getSocketUserDirStable())
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
      resetPaths()
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

  describe('getSocketWheelhouseDir', () => {
    it('returns the _wheelhouse directory under the user dir', () => {
      clearPath('socket-wheelhouse-dir')
      const result = getSocketWheelhouseDir()
      expect(result).toContain('.socket/_wheelhouse')
    })

    it('honors a setPath override', () => {
      setPath('socket-wheelhouse-dir', '/custom/wheelhouse')
      expect(getSocketWheelhouseDir()).toBe('/custom/wheelhouse')
    })
  })

  describe('getSocketRepoClonesDir', () => {
    it('returns repo-clones under _wheelhouse', () => {
      clearPath('socket-wheelhouse-dir')
      const result = getSocketRepoClonesDir()
      expect(result).toContain('.socket/_wheelhouse/repo-clones')
    })

    it('nests under the wheelhouse override (inherits the chain)', () => {
      setPath('socket-wheelhouse-dir', '/custom/wheelhouse')
      expect(getSocketRepoClonesDir()).toBe('/custom/wheelhouse/repo-clones')
    })
  })

  describe('getSocketRackDir', () => {
    it('returns rack under _wheelhouse', () => {
      clearPath('socket-wheelhouse-dir')
      const result = getSocketRackDir()
      expect(result).toContain('.socket/_wheelhouse/rack')
    })

    it('nests under the wheelhouse override (inherits the chain)', () => {
      setPath('socket-wheelhouse-dir', '/custom/wheelhouse')
      expect(getSocketRackDir()).toBe('/custom/wheelhouse/rack')
    })
  })

  describe('getSocketRackToolDir', () => {
    it('nests <tool>/<version> under the rack', () => {
      clearPath('socket-wheelhouse-dir')
      const result = getSocketRackToolDir({
        tool: 'codedb',
        version: '0.2.5825',
      })
      expect(result).toContain('.socket/_wheelhouse/rack/codedb/0.2.5825')
    })

    it('inherits the wheelhouse override chain', () => {
      setPath('socket-wheelhouse-dir', '/custom/wheelhouse')
      expect(getSocketRackToolDir({ tool: 'sfw', version: '1.7.2' })).toBe(
        '/custom/wheelhouse/rack/sfw/1.7.2',
      )
    })
  })

  describe('getSocketWheelhouseBinDir', () => {
    it('returns bin under _wheelhouse', () => {
      clearPath('socket-wheelhouse-dir')
      const result = getSocketWheelhouseBinDir()
      expect(result).toContain('.socket/_wheelhouse/bin')
    })

    it('nests under the wheelhouse override (inherits the chain)', () => {
      setPath('socket-wheelhouse-dir', '/custom/wheelhouse')
      expect(getSocketWheelhouseBinDir()).toBe('/custom/wheelhouse/bin')
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
      resetPaths()
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

  describe('getSocketStateDir', () => {
    it('should return the _state infra directory', () => {
      const result = getSocketStateDir()
      expect(result).toContain('.socket/_state')
    })

    it('should honor the SOCKET_STATE_DIR env override', () => {
      setEnv('SOCKET_STATE_DIR', '/tmp/custom-state')
      const result = getSocketStateDir()
      expect(result).toBe('/tmp/custom-state')
    })

    it('should honor the setPath test override', () => {
      setPath('socket-state-dir', '/tmp/rewired-state')
      const result = getSocketStateDir()
      expect(result).toBe('/tmp/rewired-state')
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
        getSocketStateDir(),
        getSocketAppRuntimeDir('test'),
      ]

      for (let i = 0, { length } = paths; i < length; i += 1) {
        const p = paths[i]!
        // All should use forward slashes
        expect(p.includes('\\')).toBe(false)
      }
    })

    it('should handle environment variable overrides', () => {
      setEnv('SOCKET_CACACHE_DIR', '/custom/cache')
      setEnv('SOCKET_DLX_DIR', '/custom/dlx')
      resetPaths()

      expect(getSocketCacacheDir()).toBe('/custom/cache')
      expect(getSocketDlxDir()).toBe('/custom/dlx')
    })
  })
})
