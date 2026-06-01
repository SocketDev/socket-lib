/**
 * @file Unit tests for Node.js version detection and feature support. Tests:
 *
 *   - Version getters: getNodeVersion(), getNodeMajorVersion(),
 *     getNodeMinorVersion(), getNodePatchVersion(), getMaintainedNodeVersions()
 *   - Feature detection: supportsNodeCompileCacheApi(),
 *     supportsNodeCompileCacheEnvVar(), supportsNodeDisableWarningFlag(),
 *     supportsNodePermissionFlag(), supportsNodeRequireModule(),
 *     supportsNodeRun(), supportsNodeDisableSigusr1Flag(), supportsProcessSend()
 *     Critical for Node.js version-specific behavior and compatibility.
 */

import process from 'node:process'
import {
  getMaintainedNodeVersions,
  getNodeMajorVersion,
  getNodeMinorVersion,
  getNodePatchVersion,
  getNodeVersion,
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

describe('node constants', () => {
  describe('getNodeVersion', () => {
    it('should return current Node.js version', () => {
      const version = getNodeVersion()
      expect(version).toMatch(/^v\d+\.\d+\.\d+/)
      expect(version).toBe(process.version)
    })
  })

  describe('getNodeMajorVersion', () => {
    it('should return major version number', () => {
      const major = getNodeMajorVersion()
      expect(typeof major).toBe('number')
      expect(major).toBeGreaterThan(0)
      // Current Node.js major version should be at least 18 (minimum LTS)
      expect(major).toBeGreaterThanOrEqual(18)
    })

    it('should match process.version major', () => {
      const expected = Number.parseInt(
        process.version.slice(1).split('.')[0] ?? '0',
        10,
      )
      expect(getNodeMajorVersion()).toBe(expected)
    })
  })

  describe('getNodeMinorVersion', () => {
    it('should return minor version number', () => {
      const minor = getNodeMinorVersion()
      expect(typeof minor).toBe('number')
      expect(minor).toBeGreaterThanOrEqual(0)
    })

    it('should match process.version minor', () => {
      const expected = Number.parseInt(process.version.split('.')[1] ?? '0', 10)
      expect(getNodeMinorVersion()).toBe(expected)
    })
  })

  describe('getNodePatchVersion', () => {
    it('should return patch version number', () => {
      const patch = getNodePatchVersion()
      expect(typeof patch).toBe('number')
      expect(patch).toBeGreaterThanOrEqual(0)
    })

    it('should match process.version patch', () => {
      const expected = Number.parseInt(process.version.split('.')[2] ?? '0', 10)
      expect(getNodePatchVersion()).toBe(expected)
    })
  })

  describe('getMaintainedNodeVersions', () => {
    it('should return maintained versions object', () => {
      const versions = getMaintainedNodeVersions()
      expect(versions).toBeDefined()
      expect(Array.isArray(versions)).toBe(true)
    })

    it('should have current, last, next, previous properties', () => {
      const versions = getMaintainedNodeVersions()
      expect(versions).toHaveProperty('current')
      expect(versions).toHaveProperty('last')
      expect(versions).toHaveProperty('next')
      expect(versions).toHaveProperty('previous')
    })

    it('should return same instance on multiple calls', () => {
      const first = getMaintainedNodeVersions()
      const second = getMaintainedNodeVersions()
      expect(first).toBe(second)
    })
  })

  describe('supportsNodeCompileCacheApi', () => {
    it('should return boolean', () => {
      const result = supportsNodeCompileCacheApi()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 24+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodeCompileCacheApi()
      if (major >= 24) {
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    })
  })

  describe('supportsNodeCompileCacheEnvVar', () => {
    it('should return boolean', () => {
      const result = supportsNodeCompileCacheEnvVar()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 22+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodeCompileCacheEnvVar()
      if (major >= 22) {
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    })
  })

  describe('supportsNodeDisableWarningFlag', () => {
    it('should return boolean', () => {
      const result = supportsNodeDisableWarningFlag()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 21+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodeDisableWarningFlag()
      if (major >= 21) {
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    })
  })

  describe('supportsNodePermissionFlag', () => {
    it('should return boolean', () => {
      const result = supportsNodePermissionFlag()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 20+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodePermissionFlag()
      if (major >= 20) {
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    })
  })

  describe('supportsNodeRequireModule', () => {
    it('should return boolean', () => {
      const result = supportsNodeRequireModule()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 23+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodeRequireModule()
      if (major >= 23) {
        expect(result).toBe(true)
      }
    })

    it('should check minor version for Node.js 22', () => {
      const major = getNodeMajorVersion()
      if (major === 22) {
        const minor = getNodeMinorVersion()
        const result = supportsNodeRequireModule()
        if (minor >= 12) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      }
    })
  })

  describe('supportsNodeRun', () => {
    it('should return boolean', () => {
      const result = supportsNodeRun()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 23+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodeRun()
      if (major >= 23) {
        expect(result).toBe(true)
      }
    })

    it('should check minor version for Node.js 22', () => {
      const major = getNodeMajorVersion()
      if (major === 22) {
        const minor = getNodeMinorVersion()
        const result = supportsNodeRun()
        if (minor >= 11) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      }
    })
  })

  describe('supportsNodeDisableSigusr1Flag', () => {
    it('should return boolean', () => {
      const result = supportsNodeDisableSigusr1Flag()
      expect(typeof result).toBe('boolean')
    })

    it('should check version-specific support', () => {
      const major = getNodeMajorVersion()
      const minor = getNodeMinorVersion()
      const result = supportsNodeDisableSigusr1Flag()

      if (major >= 24) {
        if (minor >= 8) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      } else if (major === 23) {
        if (minor >= 7) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      } else if (major === 22) {
        if (minor >= 14) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      } else {
        expect(result).toBe(false)
      }
    })
  })

  describe('supportsProcessSend', () => {
    it('should return boolean', () => {
      const result = supportsProcessSend()
      expect(typeof result).toBe('boolean')
    })

    it('should check if process.send exists', () => {
      const hasSend = typeof process.send === 'function'
      expect(supportsProcessSend()).toBe(hasSend)
    })
  })
})
