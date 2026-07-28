/**
 * @file Unit tests for Node.js version detection and feature support. Tests:
 *
 *   - Version getters: getNodeVersion(), getNodeMajorVersion(),
 *     getNodeMinorVersion(), getNodePatchVersion(),
 *     getMaintainedNodeVersions()
 *   - Feature detection: supportsNodeCompileCacheApi(),
 *     supportsNodeCompileCacheEnvVar(), supportsNodeDisableWarningFlag(),
 *     supportsNodePermissionFlag(), supportsNodeRequireModule(),
 *     supportsNodeRun(), supportsNodeDisableSigusr1Flag(),
 *     supportsProcessSend() Critical for Node.js version-specific behavior and
 *     compatibility.
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
  supportsNodeStripTypes,
  supportsNodeStripTypesDefault,
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

  describe('supportsNodeStripTypes', () => {
    it('should return boolean', () => {
      const result = supportsNodeStripTypes()
      expect(typeof result).toBe('boolean')
    })

    it('should return true on the current runtime (Node 22.6+ floor)', () => {
      // Tests run on Node 22.6+ (fleet floor), so this is always true here.
      // The function exists to gate older runtimes that the lib still
      // type-checks against.
      expect(supportsNodeStripTypes()).toBe(true)
    })

    it('should return true for Node.js 23+', () => {
      const major = getNodeMajorVersion()
      if (major >= 23) {
        expect(supportsNodeStripTypes()).toBe(true)
      }
    })

    it('should check minor version for Node.js 22 (cutoff at 22.6)', () => {
      const major = getNodeMajorVersion()
      if (major === 22) {
        const minor = getNodeMinorVersion()
        const result = supportsNodeStripTypes()
        if (minor >= 6) {
          expect(result).toBe(true)
        } else {
          expect(result).toBe(false)
        }
      }
    })
  })

  describe('supportsNodeStripTypesDefault', () => {
    it('should return boolean', () => {
      const result = supportsNodeStripTypesDefault()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for Node.js 24+', () => {
      const major = getNodeMajorVersion()
      const result = supportsNodeStripTypesDefault()
      if (major >= 24) {
        expect(result).toBe(true)
      } else {
        expect(result).toBe(false)
      }
    })

    it('should be a subset of supportsNodeStripTypes', () => {
      // If types are stripped by default (24+), the runtime trivially
      // supports stripping with a flag too.
      if (supportsNodeStripTypesDefault()) {
        expect(supportsNodeStripTypes()).toBe(true)
      }
    })

    it('should be false on Node 22', () => {
      // 22.x is the line where stripping is stable-with-flag, NOT
      // default-on. This anchors the lower boundary.
      const major = getNodeMajorVersion()
      if (major === 22) {
        expect(supportsNodeStripTypesDefault()).toBe(false)
      }
    })

    it('should be false on Node 23', () => {
      // 23.x also requires the flag (it's a non-LTS bridge release).
      // Default-on kicks in at 24.
      const major = getNodeMajorVersion()
      if (major === 23) {
        expect(supportsNodeStripTypesDefault()).toBe(false)
      }
    })

    it('agrees with the live runtime version', () => {
      // Cross-check: whatever supportsNodeStripTypesDefault() returns,
      // it must match `getNodeMajorVersion() >= 24`. Pins the impl
      // contract so a future refactor (e.g. adding minor-version
      // gating) doesn't quietly drift.
      const major = getNodeMajorVersion()
      expect(supportsNodeStripTypesDefault()).toBe(major >= 24)
    })
  })

  describe('supportsNodeStripTypes ↔ supportsNodeStripTypesDefault relationship', () => {
    it('default implies non-default support (one-way implication)', () => {
      // The two helpers together form a 3-state ladder:
      //   pre-22.6        → !supports & !default
      //   22.6 – 23.x     →  supports & !default
      //   24+             →  supports &  default
      // Default-on implies basic support. Basic support does NOT
      // imply default-on (22.6 / 23.x still need the flag).
      if (supportsNodeStripTypesDefault()) {
        expect(supportsNodeStripTypes()).toBe(true)
      }
    })

    it('never reports default-on without basic support', () => {
      // Belt-and-suspenders: if the file ever drifts so default-on is
      // true on a runtime that can't strip at all, the helper pair
      // is internally inconsistent.
      expect(supportsNodeStripTypesDefault() && !supportsNodeStripTypes()).toBe(
        false,
      )
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
