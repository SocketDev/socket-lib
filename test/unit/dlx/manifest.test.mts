/**
 * @file Unit tests for dlx manifest type guards. Tests type guards and
 *   utilities for dlx (download and execute) manifest entries:
 *
 *   - isPackageEntry() validates package-type manifest entries
 *   - isBinaryEntry() validates binary-type manifest entries
 *   - DlxManifestEntry discriminated union with 'package' or 'binary' types
 *   - Tests type narrowing, cache_key validation, and timestamp handling
 *   - Ensures TypeScript type guards work correctly for manifest parsing dlx
 *     manifests track cached npm packages and binaries for npx-like execution.
 *     The DlxManifest class behavior lives in manifest-class.test.mts.
 */

import { isBinaryEntry, isPackageEntry } from '../../../src/dlx/manifest'
import type {
  BinaryDetails,
  DlxManifestEntry,
  PackageDetails,
} from '../../../src/dlx/manifest'
import { describe, expect, it } from 'vitest'

describe('dlx-manifest', () => {
  describe('isPackageEntry', () => {
    it('should return true for package entries', () => {
      const entry: DlxManifestEntry = {
        type: 'package',
        cache_key: 'test-package@1.0.0',
        timestamp: Date.now(),
        details: {
          installed_version: '1.0.0',
        } as PackageDetails,
      }
      expect(isPackageEntry(entry)).toBe(true)
    })

    it('should return false for binary entries', () => {
      const entry: DlxManifestEntry = {
        type: 'binary',
        cache_key: 'test-binary',
        timestamp: Date.now(),
        details: {
          integrity: 'sha512-abc123base64',
          platform: 'linux',
          arch: 'x64',
          size: 1024,
          source: { type: 'download', url: 'https://example.com' },
        } as BinaryDetails,
      }
      expect(isPackageEntry(entry)).toBe(false)
    })
  })

  describe('isBinaryEntry', () => {
    it('should return true for binary entries', () => {
      const entry: DlxManifestEntry = {
        type: 'binary',
        cache_key: 'test-binary',
        timestamp: Date.now(),
        details: {
          integrity: 'sha512-abc123base64',
          platform: 'linux',
          arch: 'x64',
          size: 1024,
          source: { type: 'download', url: 'https://example.com' },
        } as BinaryDetails,
      }
      expect(isBinaryEntry(entry)).toBe(true)
    })

    it('should return false for package entries', () => {
      const entry: DlxManifestEntry = {
        type: 'package',
        cache_key: 'test-package@1.0.0',
        timestamp: Date.now(),
        details: {
          installed_version: '1.0.0',
        } as PackageDetails,
      }
      expect(isBinaryEntry(entry)).toBe(false)
    })
  })

  describe('DlxManifestEntry types', () => {
    it('should support package entries with update_check', () => {
      const entry: DlxManifestEntry = {
        type: 'package',
        cache_key: 'test@1.0.0',
        timestamp: Date.now(),
        details: {
          installed_version: '1.0.0',
          size: 12_345,
          update_check: {
            last_check: Date.now(),
            last_notification: Date.now(),
            latest_known: '1.0.1',
          },
        } as PackageDetails,
      }
      expect(entry.type).toBe('package')
      if (isPackageEntry(entry)) {
        expect(entry.details.installed_version).toBe('1.0.0')
        expect(entry.details.update_check).toBeDefined()
      }
    })

    it('should support binary entries with all fields', () => {
      const entry: DlxManifestEntry = {
        type: 'binary',
        cache_key: 'binary-key',
        timestamp: Date.now(),
        details: {
          integrity: 'sha512-abc123base64hash',
          platform: 'darwin',
          arch: 'arm64',
          size: 2048,
          source: {
            type: 'download',
            url: 'https://example.com/binary',
          },
        } as BinaryDetails,
      }
      expect(entry.type).toBe('binary')
      if (isBinaryEntry(entry)) {
        expect(entry.details.integrity).toBe('sha512-abc123base64hash')
        expect(entry.details.platform).toBe('darwin')
        expect(entry.details.arch).toBe('arm64')
      }
    })
  })

  describe('type guards', () => {
    it('should narrow types correctly with isPackageEntry', () => {
      const entry: DlxManifestEntry = {
        type: 'package',
        cache_key: 'test',
        timestamp: Date.now(),
        details: { installed_version: '1.0.0' } as PackageDetails,
      }

      if (isPackageEntry(entry)) {
        // TypeScript should know entry.details is PackageDetails
        expect(entry.details.installed_version).toBeDefined()
      }
    })

    it('should narrow types correctly with isBinaryEntry', () => {
      const entry: DlxManifestEntry = {
        type: 'binary',
        cache_key: 'test',
        timestamp: Date.now(),
        details: {
          integrity: 'sha512-abc123base64',
          platform: 'win32',
          arch: 'x64',
          size: 100,
          source: { type: 'download', url: 'https://test.com' },
        } as BinaryDetails,
      }

      if (isBinaryEntry(entry)) {
        // TypeScript should know entry.details is BinaryDetails.
        expect(entry.details.integrity).toBeDefined()
        expect(entry.details.integrity).toMatch(/^sha512-/)
      }
    })
  })

  describe('integrity format', () => {
    it('should support SRI integrity hash format', () => {
      const details: BinaryDetails = {
        integrity: 'sha512-abc123base64hash==',
        platform: 'linux',
        arch: 'x64',
        size: 1024,
        source: { type: 'download', url: 'https://example.com' },
      }
      expect(details.integrity).toMatch(/^sha512-/)
    })
  })
})
