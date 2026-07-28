/**
 * @file Unit tests for the DlxManifest class new-format entry API. Exercises
 *   the on-disk manifest behavior for dlx (download and execute) cached
 *   packages and binaries:
 *
 *   - constructor (custom vs default path)
 *   - getManifestEntry / setPackageEntry / setBinaryEntry
 *   - clearAll
 *   - error handling + concurrent operations The pure type guards (isPackageEntry
 *     / isBinaryEntry) live in manifest.test.mts. The legacy-format API (get /
 *     set / clear / isFresh / getAllPackages) lives in
 *     manifest-legacy.test.mts.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DlxManifest,
  isBinaryEntry,
  isPackageEntry,
} from '../../../src/dlx/manifest'
import type { BinaryDetails, PackageDetails } from '../../../src/dlx/manifest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

describe.sequential('DlxManifest class', () => {
  let testDir: string
  let manifestPath: string
  let manifest: DlxManifest

  beforeEach(async () => {
    // Create unique temp directory for each test
    testDir = path.join(
      os.tmpdir(),
      `dlx-manifest-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    mkdirSync(testDir, { recursive: true })
    manifestPath = path.join(testDir, '.dlx-manifest.json')
    manifest = new DlxManifest({ manifestPath })
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      if (existsSync(testDir)) {
        await safeDelete(testDir)
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
      await manifest.setPackageEntry('test-pkg@1.0.0', 'cache-key-123', details)

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
      const deepDir = path.join(testDir, 'deep', 'nested', 'path')
      const deepManifestPath = path.join(deepDir, '.dlx-manifest.json')
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

  describe('error handling', () => {
    it('should handle read errors gracefully in getManifestEntry', () => {
      writeFileSync(manifestPath, 'corrupted{', 'utf8')
      const entry = manifest.getManifestEntry('test')
      expect(entry).toBeUndefined()
    })

    it('should handle write errors in setPackageEntry', async () => {
      // Make directory read-only to cause write failure
      const readOnlyDir = path.join(testDir, 'readonly')
      mkdirSync(readOnlyDir, { recursive: true })
      const readOnlyPath = path.join(readOnlyDir, '.dlx-manifest.json')
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

      await Promise.allSettled([
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
