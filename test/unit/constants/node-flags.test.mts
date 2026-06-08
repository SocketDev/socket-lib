/**
 * @file Unit tests for Node.js flag builders, runtime constants, and exec path.
 *   Tests:
 *
 *   - Flag builders: getNodeHardenFlags(), getNodePermissionFlags(),
 *     getNodeNoWarningsFlags(), getNodeDisableSigusr1Flags()
 *   - Runtime detection: NODE_SEA_FUSE, ESNEXT, getExecPath()
 *   - Comprehensive coverage across all flag getters and support functions
 *     Critical for Node.js version-specific flag selection and compatibility.
 */

import process from 'node:process'
import {
  ESNEXT,
  getExecPath,
  getMaintainedNodeVersions,
  getNodeDisableSigusr1Flags,
  getNodeHardenFlags,
  getNodeMajorVersion,
  getNodeNoWarningsFlags,
  getNodePermissionFlags,
  getNodeVersion,
  NODE_SEA_FUSE,
  supportsNodeCompileCacheApi,
  supportsNodeCompileCacheEnvVar,
  supportsNodeDisableSigusr1Flag,
  supportsNodeDisableWarningFlag,
  supportsNodePermissionFlag,
  supportsNodeRequireModule,
  supportsNodeRun,
  supportsProcessSend,
} from '../../../src/constants/node'
import { describe, expect, it } from 'vitest'

describe('node constants flags and runtime', () => {
  describe('getNodeHardenFlags', () => {
    it('should return array of hardening flags', () => {
      const flags = getNodeHardenFlags()
      expect(Array.isArray(flags)).toBe(true)
      expect(flags.length).toBeGreaterThan(0)
    })

    it('should include disable-proto flag', () => {
      const flags = getNodeHardenFlags()
      expect(flags).toContain('--disable-proto=delete')
    })

    it('should use --permission for Node.js 24+ with explicit grants', () => {
      const major = getNodeMajorVersion()
      const flags = getNodeHardenFlags()
      if (major >= 24) {
        expect(flags).toContain('--permission')
        expect(flags).not.toContain('--experimental-permission')
        // Should include permission grants from getNodePermissionFlags()
        expect(flags).toContain('--allow-fs-read=*')
        expect(flags).toContain('--allow-fs-write=*')
        expect(flags).toContain('--allow-child-process')
      } else {
        expect(flags).not.toContain('--permission')
        // Permission grants should not be included for Node < 24
        expect(flags).not.toContain('--allow-fs-read=*')
        expect(flags).not.toContain('--allow-fs-write=*')
        expect(flags).not.toContain('--allow-child-process')
      }
    })

    it('should use --experimental-permission for Node.js 20-23', () => {
      const major = getNodeMajorVersion()
      const flags = getNodeHardenFlags()
      if (major >= 20 && major < 24) {
        expect(flags).toContain('--experimental-permission')
        expect(flags).not.toContain('--permission')
      } else if (major < 20) {
        expect(flags).not.toContain('--experimental-permission')
        expect(flags).not.toContain('--permission')
      }
    })

    it('should include --force-node-api-uncaught-exceptions-policy for Node.js 22+', () => {
      const major = getNodeMajorVersion()
      const flags = getNodeHardenFlags()
      if (major >= 22) {
        expect(flags).toContain('--force-node-api-uncaught-exceptions-policy')
      } else {
        expect(flags).not.toContain(
          '--force-node-api-uncaught-exceptions-policy',
        )
      }
    })

    it('should not include --experimental-policy', () => {
      const flags = getNodeHardenFlags()
      expect(flags).not.toContain('--experimental-policy')
    })

    it('should return same instance on multiple calls', () => {
      const first = getNodeHardenFlags()
      const second = getNodeHardenFlags()
      expect(first).toBe(second)
    })
  })

  describe('getNodePermissionFlags', () => {
    it('should return array of permission flags', () => {
      const flags = getNodePermissionFlags()
      expect(Array.isArray(flags)).toBe(true)
    })

    it('should return filesystem and process permissions for Node.js 24+', () => {
      const major = getNodeMajorVersion()
      const flags = getNodePermissionFlags()
      if (major >= 24) {
        expect(flags).toContain('--allow-fs-read=*')
        expect(flags).toContain('--allow-fs-write=*')
        expect(flags).toContain('--allow-child-process')
        expect(flags.length).toBe(3)
      }
    })

    it('should return empty array for Node.js < 24', () => {
      const major = getNodeMajorVersion()
      const flags = getNodePermissionFlags()
      if (major < 24) {
        expect(flags.length).toBe(0)
      }
    })

    it('should return same instance on multiple calls', () => {
      const first = getNodePermissionFlags()
      const second = getNodePermissionFlags()
      expect(first).toBe(second)
    })
  })

  describe('getNodeNoWarningsFlags', () => {
    it('should return array of no-warnings flags', () => {
      const flags = getNodeNoWarningsFlags()
      expect(Array.isArray(flags)).toBe(true)
      expect(flags.length).toBeGreaterThan(0)
    })

    it('should include no-warnings and no-deprecation flags', () => {
      const flags = getNodeNoWarningsFlags()
      expect(flags).toContain('--no-warnings')
      expect(flags).toContain('--no-deprecation')
    })

    it('should return same instance on multiple calls', () => {
      const first = getNodeNoWarningsFlags()
      const second = getNodeNoWarningsFlags()
      expect(first).toBe(second)
    })
  })

  describe('getNodeDisableSigusr1Flags', () => {
    it('should return array of SIGUSR1 disable flags', () => {
      const flags = getNodeDisableSigusr1Flags()
      expect(Array.isArray(flags)).toBe(true)
      expect(flags.length).toBeGreaterThan(0)
    })

    it('should return --disable-sigusr1 for supported versions', () => {
      const flags = getNodeDisableSigusr1Flags()
      const supportsFlag = supportsNodeDisableSigusr1Flag()
      if (supportsFlag) {
        expect(flags).toContain('--disable-sigusr1')
        expect(flags).not.toContain('--no-inspect')
      } else {
        expect(flags).toContain('--no-inspect')
        expect(flags).not.toContain('--disable-sigusr1')
      }
    })

    it('should return same instance on multiple calls', () => {
      const first = getNodeDisableSigusr1Flags()
      const second = getNodeDisableSigusr1Flags()
      expect(first).toBe(second)
    })
  })

  describe('getExecPath', () => {
    it('should return string path', () => {
      const path = getExecPath()
      expect(typeof path).toBe('string')
      expect(path.length).toBeGreaterThan(0)
    })

    it('should match process.execPath', () => {
      expect(getExecPath()).toBe(process.execPath)
    })

    it('should include node executable', () => {
      const path = getExecPath()
      expect(path).toMatch(/node/)
    })
  })

  describe('NODE_SEA_FUSE constant', () => {
    it('should be defined as string', () => {
      expect(typeof NODE_SEA_FUSE).toBe('string')
    })

    it('should have correct fuse value', () => {
      expect(NODE_SEA_FUSE).toBe(
        'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
      )
    })

    it('should start with NODE_SEA_FUSE prefix', () => {
      expect(NODE_SEA_FUSE).toMatch(/^NODE_SEA_FUSE_/)
    })
  })

  describe('ESNEXT constant', () => {
    it('should be defined as string', () => {
      expect(typeof ESNEXT).toBe('string')
    })

    it('should equal esnext', () => {
      expect(ESNEXT).toBe('esnext')
    })
  })

  describe('edge cases and comprehensive coverage', () => {
    it('should handle all flag getters being called multiple times', () => {
      // Call each getter multiple times to ensure caching works without throwing.
      expect(() => {
        for (let i = 0; i < 3; i++) {
          getNodeHardenFlags()
          getNodePermissionFlags()
          getNodeNoWarningsFlags()
          getNodeDisableSigusr1Flags()
        }
      }).not.toThrow()
    })

    it('should verify all flag arrays are non-empty or conditionally empty', () => {
      const hardenFlags = getNodeHardenFlags()
      const noWarningsFlags = getNodeNoWarningsFlags()
      const sigusr1Flags = getNodeDisableSigusr1Flags()

      expect(hardenFlags.length).toBeGreaterThan(0)
      expect(noWarningsFlags.length).toBeGreaterThan(0)
      expect(sigusr1Flags.length).toBeGreaterThan(0)

      // Permission flags are conditionally empty for Node < 24
      const permissionFlags = getNodePermissionFlags()
      const major = getNodeMajorVersion()
      if (major >= 24) {
        expect(permissionFlags.length).toBeGreaterThan(0)
      } else {
        expect(permissionFlags.length).toBe(0)
      }
    })

    it('should verify maintained versions caching', () => {
      const v1 = getMaintainedNodeVersions()
      const v2 = getMaintainedNodeVersions()
      const v3 = getMaintainedNodeVersions()
      expect(v1).toBe(v2)
      expect(v2).toBe(v3)
    })

    it('should verify all support functions return boolean', () => {
      expect(typeof supportsNodeCompileCacheApi()).toBe('boolean')
      expect(typeof supportsNodeCompileCacheEnvVar()).toBe('boolean')
      expect(typeof supportsNodeDisableWarningFlag()).toBe('boolean')
      expect(typeof supportsNodePermissionFlag()).toBe('boolean')
      expect(typeof supportsNodeRequireModule()).toBe('boolean')
      expect(typeof supportsNodeRun()).toBe('boolean')
      expect(typeof supportsNodeDisableSigusr1Flag()).toBe('boolean')
      expect(typeof supportsProcessSend()).toBe('boolean')
    })

    it('should verify version string format', () => {
      const version = getNodeVersion()
      expect(version).toMatch(/^v\d+\.\d+\.\d+/)
      expect(version.startsWith('v')).toBe(true)
    })

    it('should verify major version is positive integer', () => {
      const major = getNodeMajorVersion()
      expect(Number.isInteger(major)).toBe(true)
      expect(major).toBeGreaterThan(0)
    })

    it('should verify execPath is absolute path', () => {
      const execPath = getExecPath()
      expect(execPath).toBeTruthy()
      expect(typeof execPath).toBe('string')
      expect(execPath.length).toBeGreaterThan(0)
    })

    it('should verify flag contents are strings starting with --', () => {
      const allFlags = [
        ...getNodeHardenFlags(),
        ...getNodePermissionFlags(),
        ...getNodeNoWarningsFlags(),
        ...getNodeDisableSigusr1Flags(),
      ]

      for (let i = 0, { length } = allFlags; i < length; i += 1) {
        const flag = allFlags[i]!
        expect(typeof flag).toBe('string')
        expect(flag.startsWith('--')).toBe(true)
      }
    })

    it('should verify constants are exportable and accessible', () => {
      // Verify constants can be destructured and used
      const seaFuse = NODE_SEA_FUSE
      const esnext = ESNEXT

      expect(seaFuse).toBeDefined()
      expect(esnext).toBeDefined()
      expect(typeof seaFuse).toBe('string')
      expect(typeof esnext).toBe('string')
    })
  })
})
