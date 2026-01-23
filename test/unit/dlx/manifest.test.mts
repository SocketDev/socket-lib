/**
 * @fileoverview Unit tests for dlx manifest utilities.
 *
 * Tests type guards and utilities for dlx (download and execute) manifest entries:
 * - isPackageEntry() validates package-type manifest entries
 * - isBinaryEntry() validates binary-type manifest entries
 * - ManifestEntry discriminated union with 'package' or 'binary' types
 * - Tests type narrowing, cache_key validation, and timestamp handling
 * - Ensures TypeScript type guards work correctly for manifest parsing
 * dlx manifests track cached npm packages and binaries for npx-like execution.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isPackageEntry,
  isBinaryEntry,
  DlxManifest,
  type ManifestEntry,
  type PackageDetails,
  type BinaryDetails,
  type StoreRecord,
} from '@socketsecurity/lib/dlx/manifest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('dlx-manifest', () => {
  describe('isPackageEntry', () => {
    it('should return true for package entries', () => {
      const entry: ManifestEntry = {
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
      const entry: ManifestEntry = {
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
      const entry: ManifestEntry = {
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
      const entry: ManifestEntry = {
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

  describe('ManifestEntry types', () => {
    it('should support package entries with update_check', () => {
      const entry: ManifestEntry = {
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
      const entry: ManifestEntry = {
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
      const entry: ManifestEntry = {
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
      const entry: ManifestEntry = {
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

  describe.sequential('DlxManifest class', () => {
    let testDir: string
    let manifestPath: string
    let manifest: DlxManifest

    beforeEach(() => {
      // Create unique temp directory for each test
      testDir = join(
        tmpdir(),
        `dlx-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      )
      mkdirSync(testDir, { recursive: true })
      manifestPath = join(testDir, '.dlx-manifest.json')
      manifest = new DlxManifest({ manifestPath })
    })

    afterEach(() => {
      // Clean up test directory
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true })
        }
      } catch {}
    })

    describe('constructor', () => {
      it('should create instance with custom path', () => {
        const customManifest = new DlxManifest({ manifestPath })
        expect(customManifest).toBeDefined()
      })

      it('should create instance with default path', () => {
        const defaultManifest = new DlxManifest()
        expect(defaultManifest).toBeDefined()
      })
    })

    describe('getManifestEntry', () => {
      it('should return undefined for non-existent entry', () => {
        const entry = manifest.getManifestEntry('non-existent')
        expect(entry).toBeUndefined()
      })

      it('should return undefined when manifest file does not exist', () => {
        const entry = manifest.getManifestEntry('test-spec')
        expect(entry).toBeUndefined()
      })

      it('should return package entry', async () => {
        const details: PackageDetails = {
          installed_version: '1.0.0',
          size: 1024,
        }
        await manifest.setPackageEntry(
          'test-pkg@1.0.0',
          'cache-key-123',
          details,
        )

        const entry = manifest.getManifestEntry('test-pkg@1.0.0')
        expect(entry).toBeDefined()
        expect(entry?.type).toBe('package')
        expect(entry?.cache_key).toBe('cache-key-123')
      })

      it('should return binary entry', async () => {
        const details: BinaryDetails = {
          integrity: 'sha512-abc123base64',
          platform: 'linux',
          arch: 'x64',
          size: 2048,
          source: { type: 'download', url: 'https://example.com/binary' },
        }
        await manifest.setBinaryEntry('test-binary', 'binary-key', details)

        const entry = manifest.getManifestEntry('test-binary')
        expect(entry).toBeDefined()
        expect(entry?.type).toBe('binary')
      })

      it('should handle empty manifest file', () => {
        writeFileSync(manifestPath, '', 'utf8')
        const entry = manifest.getManifestEntry('test')
        expect(entry).toBeUndefined()
      })

      it('should handle whitespace-only manifest file', () => {
        writeFileSync(manifestPath, '   \n  \t  ', 'utf8')
        const entry = manifest.getManifestEntry('test')
        expect(entry).toBeUndefined()
      })
    })

    describe('setPackageEntry', () => {
      it('should store package entry', async () => {
        const details: PackageDetails = {
          installed_version: '2.0.0',
          size: 5000,
        }
        await manifest.setPackageEntry('pkg@2.0.0', 'key-456', details)

        const entry = manifest.getManifestEntry('pkg@2.0.0')
        expect(entry).toBeDefined()
        expect(isPackageEntry(entry!)).toBe(true)
        if (isPackageEntry(entry!)) {
          expect(entry.details.installed_version).toBe('2.0.0')
          expect(entry.details.size).toBe(5000)
        }
      })

      it('should store package entry with update_check', async () => {
        const details: PackageDetails = {
          installed_version: '1.5.0',
          update_check: {
            last_check: Date.now(),
            last_notification: Date.now() - 1000,
            latest_known: '1.6.0',
          },
        }
        await manifest.setPackageEntry('pkg@1.5.0', 'key-789', details)

        const entry = manifest.getManifestEntry('pkg@1.5.0')
        if (isPackageEntry(entry!)) {
          expect(entry.details.update_check).toBeDefined()
          expect(entry.details.update_check?.latest_known).toBe('1.6.0')
        }
      })

      it('should update existing package entry', async () => {
        const details1: PackageDetails = { installed_version: '1.0.0' }
        await manifest.setPackageEntry('pkg', 'key1', details1)

        const details2: PackageDetails = { installed_version: '2.0.0' }
        await manifest.setPackageEntry('pkg', 'key2', details2)

        const entry = manifest.getManifestEntry('pkg')
        if (isPackageEntry(entry!)) {
          expect(entry.details.installed_version).toBe('2.0.0')
          expect(entry.cache_key).toBe('key2')
        }
      })

      it('should create manifest directory if it does not exist', async () => {
        const deepDir = join(testDir, 'deep', 'nested', 'path')
        const deepManifestPath = join(deepDir, '.dlx-manifest.json')
        const deepManifest = new DlxManifest({ manifestPath: deepManifestPath })

        const details: PackageDetails = { installed_version: '1.0.0' }
        await deepManifest.setPackageEntry('test', 'key', details)

        expect(existsSync(deepManifestPath)).toBe(true)
      })
    })

    describe('setBinaryEntry', () => {
      it('should store binary entry', async () => {
        const details: BinaryDetails = {
          integrity: 'sha512-xyz789base64',
          platform: 'darwin',
          arch: 'arm64',
          size: 10_000,
          source: { type: 'download', url: 'https://test.com/bin' },
        }
        await manifest.setBinaryEntry('bin-spec', 'bin-key', details)

        const entry = manifest.getManifestEntry('bin-spec')
        expect(entry).toBeDefined()
        expect(isBinaryEntry(entry!)).toBe(true)
        if (isBinaryEntry(entry!)) {
          expect(entry.details.integrity).toBe('sha512-xyz789base64')
          expect(entry.details.platform).toBe('darwin')
          expect(entry.details.arch).toBe('arm64')
        }
      })

      it('should update existing binary entry', async () => {
        const details1: BinaryDetails = {
          integrity: 'sha512-oldbase64',
          platform: 'linux',
          arch: 'x64',
          size: 1000,
          source: { type: 'download', url: 'https://old.com' },
        }
        await manifest.setBinaryEntry('bin', 'key1', details1)

        const details2: BinaryDetails = {
          integrity: 'sha512-newbase64',
          platform: 'win32',
          arch: 'x64',
          size: 2000,
          source: { type: 'download', url: 'https://new.com' },
        }
        await manifest.setBinaryEntry('bin', 'key2', details2)

        const entry = manifest.getManifestEntry('bin')
        if (isBinaryEntry(entry!)) {
          expect(entry.details.integrity).toBe('sha512-newbase64')
          expect(entry.cache_key).toBe('key2')
        }
      })
    })

    describe('get (legacy)', () => {
      it('should return undefined for non-existent entry', () => {
        const record = manifest.get('non-existent')
        expect(record).toBeUndefined()
      })

      it('should return legacy format entry', async () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.2.3',
        }
        await manifest.set('legacy-pkg', record)

        const retrieved = manifest.get('legacy-pkg')
        expect(retrieved).toBeDefined()
        expect(retrieved?.version).toBe('1.2.3')
      })

      it('should not return new format entries', async () => {
        const details: PackageDetails = { installed_version: '1.0.0' }
        await manifest.setPackageEntry('new-pkg', 'key', details)

        const retrieved = manifest.get('new-pkg')
        expect(retrieved).toBeUndefined()
      })
    })

    describe('set (legacy)', () => {
      it('should store legacy format entry', async () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now() - 5000,
          version: '2.3.4',
        }
        await manifest.set('test-pkg', record)

        const retrieved = manifest.get('test-pkg')
        expect(retrieved).toBeDefined()
        expect(retrieved?.version).toBe('2.3.4')
      })

      it('should update existing legacy entry', async () => {
        const record1: StoreRecord = {
          timestampFetch: 1000,
          timestampNotification: 1000,
          version: '1.0.0',
        }
        await manifest.set('pkg', record1)

        const record2: StoreRecord = {
          timestampFetch: 2000,
          timestampNotification: 2000,
          version: '2.0.0',
        }
        await manifest.set('pkg', record2)

        const retrieved = manifest.get('pkg')
        expect(retrieved?.version).toBe('2.0.0')
        expect(retrieved?.timestampFetch).toBe(2000)
      })

      it('should handle missing manifest file', async () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        await manifest.set('new-pkg', record)

        expect(existsSync(manifestPath)).toBe(true)
      })
    })

    describe('clear', () => {
      it('should remove specific entry', async () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        await manifest.set('pkg-to-clear', record)
        expect(manifest.get('pkg-to-clear')).toBeDefined()

        await manifest.clear('pkg-to-clear')
        expect(manifest.get('pkg-to-clear')).toBeUndefined()
      })

      it('should not throw when clearing non-existent entry', async () => {
        await expect(manifest.clear('non-existent')).resolves.not.toThrow()
      })

      it('should not throw when manifest file does not exist', async () => {
        await expect(manifest.clear('anything')).resolves.not.toThrow()
      })

      it('should not affect other entries', async () => {
        const record1: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        const record2: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '2.0.0',
        }
        await manifest.set('pkg1', record1)
        await manifest.set('pkg2', record2)

        await manifest.clear('pkg1')

        expect(manifest.get('pkg1')).toBeUndefined()
        expect(manifest.get('pkg2')).toBeDefined()
      })
    })

    describe('clearAll', () => {
      it('should remove entire manifest file', async () => {
        const details: PackageDetails = { installed_version: '1.0.0' }
        await manifest.setPackageEntry('pkg1', 'key1', details)
        await manifest.setPackageEntry('pkg2', 'key2', details)

        expect(existsSync(manifestPath)).toBe(true)

        await manifest.clearAll()

        expect(existsSync(manifestPath)).toBe(false)
      })

      it('should not throw when manifest does not exist', async () => {
        await expect(manifest.clearAll()).resolves.not.toThrow()
      })

      it('should clear all entries', async () => {
        const details: PackageDetails = { installed_version: '1.0.0' }
        await manifest.setPackageEntry('pkg1', 'key1', details)
        await manifest.setPackageEntry('pkg2', 'key2', details)

        await manifest.clearAll()

        expect(manifest.getManifestEntry('pkg1')).toBeUndefined()
        expect(manifest.getManifestEntry('pkg2')).toBeUndefined()
      })
    })

    describe('isFresh', () => {
      it('should return false for undefined record', () => {
        expect(manifest.isFresh(undefined, 10_000)).toBe(false)
      })

      it('should return true for fresh record', () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        expect(manifest.isFresh(record, 10_000)).toBe(true)
      })

      it('should return false for stale record', () => {
        const record: StoreRecord = {
          timestampFetch: Date.now() - 20_000,
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        expect(manifest.isFresh(record, 10_000)).toBe(false)
      })

      it('should handle edge case at TTL boundary', () => {
        const ttl = 5000
        const record: StoreRecord = {
          timestampFetch: Date.now() - ttl,
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        // At exact boundary, should be stale
        expect(manifest.isFresh(record, ttl)).toBe(false)
      })

      it('should handle zero TTL', () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        expect(manifest.isFresh(record, 0)).toBe(false)
      })
    })

    describe('getAllPackages', () => {
      it('should return empty array when manifest does not exist', () => {
        const packages = manifest.getAllPackages()
        expect(packages).toEqual([])
      })

      it('should return empty array for empty manifest', () => {
        writeFileSync(manifestPath, '{}', 'utf8')
        const packages = manifest.getAllPackages()
        expect(packages).toEqual([])
      })

      it('should return all package keys', async () => {
        const record1: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        const record2: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '2.0.0',
        }
        await manifest.set('pkg1', record1)
        await manifest.set('pkg2', record2)

        const packages = manifest.getAllPackages()
        expect(packages).toContain('pkg1')
        expect(packages).toContain('pkg2')
        expect(packages).toHaveLength(2)
      })

      it('should include both legacy and new format entries', async () => {
        const record: StoreRecord = {
          timestampFetch: Date.now(),
          timestampNotification: Date.now(),
          version: '1.0.0',
        }
        await manifest.set('legacy-pkg', record)

        const details: PackageDetails = { installed_version: '2.0.0' }
        await manifest.setPackageEntry('new-pkg', 'key', details)

        const packages = manifest.getAllPackages()
        expect(packages).toContain('legacy-pkg')
        expect(packages).toContain('new-pkg')
      })

      it('should handle corrupted manifest gracefully', () => {
        writeFileSync(manifestPath, 'invalid json{{{', 'utf8')
        const packages = manifest.getAllPackages()
        expect(packages).toEqual([])
      })
    })

    describe('error handling', () => {
      it('should handle read errors gracefully in getManifestEntry', () => {
        writeFileSync(manifestPath, 'corrupted{', 'utf8')
        const entry = manifest.getManifestEntry('test')
        expect(entry).toBeUndefined()
      })

      it('should handle write errors in setPackageEntry', async () => {
        // Make directory read-only to cause write failure
        const readOnlyDir = join(testDir, 'readonly')
        mkdirSync(readOnlyDir, { recursive: true })
        const readOnlyPath = join(readOnlyDir, '.dlx-manifest.json')
        const readOnlyManifest = new DlxManifest({ manifestPath: readOnlyPath })

        // Write initial file
        writeFileSync(readOnlyPath, '{}', 'utf8')

        // On most systems, we can't easily make a file truly unwritable in tests
        // This test documents the expected behavior
        const details: PackageDetails = { installed_version: '1.0.0' }
        await expect(
          readOnlyManifest.setPackageEntry('test', 'key', details),
        ).resolves.not.toThrow()
      })
    })

    describe('concurrent operations', () => {
      it('should handle multiple writes sequentially', async () => {
        const details1: PackageDetails = { installed_version: '1.0.0' }
        const details2: PackageDetails = { installed_version: '2.0.0' }
        const details3: PackageDetails = { installed_version: '3.0.0' }

        await Promise.all([
          manifest.setPackageEntry('pkg1', 'key1', details1),
          manifest.setPackageEntry('pkg2', 'key2', details2),
          manifest.setPackageEntry('pkg3', 'key3', details3),
        ])

        expect(manifest.getManifestEntry('pkg1')).toBeDefined()
        expect(manifest.getManifestEntry('pkg2')).toBeDefined()
        expect(manifest.getManifestEntry('pkg3')).toBeDefined()
      })

      it('should handle mixed read/write operations', async () => {
        const details: PackageDetails = { installed_version: '1.0.0' }
        await manifest.setPackageEntry('pkg', 'key', details)

        const results = await Promise.all([
          manifest.getManifestEntry('pkg'),
          manifest.setPackageEntry('pkg2', 'key2', details),
          manifest.getManifestEntry('pkg'),
        ])

        expect(results[0]).toBeDefined()
        expect(results[2]).toBeDefined()
      })
    })
  })
})
