/**
 * @file Unit tests for DLX (Download and Execute) cache management utilities.
 *   Tests DLX cache directory lifecycle and package management:
 *
 *   - ensureDlxDir(), ensureDlxDirSync() cache directory creation
 *   - clearDlx(), clearDlxSync() cache cleanup
 *   - dlxDirExists() cache existence checks
 *   - isDlxPackageInstalled(), listDlxPackages() package management
 *   - removeDlxPackage(), removeDlxPackageSync() package removal
 *   - generateCacheKey() creates unique cache keys for packages Used by Socket
 *     CLI for pnpm dlx / npx-style package execution.
 *
 *   The pure path-resolution tests live in paths.test.mts.
 */

import crypto from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  promises as fsPromises,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSocketDlxDir } from '@socketsecurity/lib-stable/paths/socket'

import { generateCacheKey } from '../../../src/dlx/cache'
import {
  clearDlx,
  clearDlxSync,
  dlxDirExists,
  ensureDlxDir,
  ensureDlxDirSync,
} from '../../../src/dlx/dir'
import {
  isDlxPackageInstalled,
  listDlxPackages,
  listDlxPackagesAsync,
  removeDlxPackage,
  removeDlxPackageSync,
} from '../../../src/dlx/packages'
import {
  getDlxInstalledPackageDir,
  getDlxPackageDir,
} from '../../../src/dlx/paths'
import { safeDelete, safeDeleteSync } from '../../../src/fs/safe'

describe.sequential('dlx', () => {
  const testPackageName = 'test-package'
  let originalEnv: string | undefined
  let testDlxDir: string

  beforeEach(async () => {
    // Save original env and create isolated test directory
    originalEnv = process.env['SOCKET_DLX_DIR']
    testDlxDir = path.join(os.tmpdir(), `socket-dlx-test-${crypto.randomUUID()}`)
    process.env['SOCKET_DLX_DIR'] = testDlxDir

    // Clean up any existing test artifacts
    await clearDlx().catch(() => {})
  })

  afterEach(async () => {
    // Clean up after tests
    await clearDlx().catch(() => {})

    // Remove test directory
    try {
      await safeDelete(testDlxDir)
    } catch {}

    // Restore original env
    if (originalEnv === undefined) {
      delete process.env['SOCKET_DLX_DIR']
    } else {
      process.env['SOCKET_DLX_DIR'] = originalEnv
    }
  })

  describe('generateCacheKey', () => {
    it('should generate a 16-character hex string', () => {
      const key = generateCacheKey('test-spec')
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should generate consistent keys for same input', () => {
      const key1 = generateCacheKey('test-spec')
      const key2 = generateCacheKey('test-spec')
      expect(key1).toBe(key2)
    })

    it('should generate different keys for different inputs', () => {
      const key1 = generateCacheKey('test-spec-1')
      const key2 = generateCacheKey('test-spec-2')
      expect(key1).not.toBe(key2)
    })

    it('should handle package specs with versions', () => {
      const key = generateCacheKey('npm:prettier@3.0.0')
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should handle empty strings', () => {
      const key = generateCacheKey('')
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should handle special characters', () => {
      const key = generateCacheKey('test@#$%^&*()_+-=[]{}|;:,.<>?')
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should handle unicode characters', () => {
      const key = generateCacheKey('测试-тест-テスト')
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should handle very long inputs', () => {
      const longSpec = 'a'.repeat(10_000)
      const key = generateCacheKey(longSpec)
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should handle URLs as specs', () => {
      const key = generateCacheKey('https://example.com/binary.tar.gz:binary')
      expect(key).toHaveLength(16)
      expect(key).toMatch(/^[0-9a-f]{16}$/)
    })

    it('should produce different hashes for similar strings', () => {
      const key1 = generateCacheKey('npm:test@1.0.0')
      const key2 = generateCacheKey('npm:test@1.0.1')
      expect(key1).not.toBe(key2)
    })
  })

  describe('dlxDirExists', () => {
    it('should return false when DLX directory does not exist', () => {
      // Ensure it doesn't exist
      if (existsSync(getSocketDlxDir())) {
        safeDeleteSync(getSocketDlxDir(), { force: true })
      }
      expect(dlxDirExists()).toBe(false)
    })

    it('should return true when DLX directory exists', async () => {
      await ensureDlxDir()
      expect(dlxDirExists()).toBe(true)
    })
  })

  describe('ensureDlxDir / ensureDlxDirSync', () => {
    it('should create DLX directory if it does not exist', async () => {
      // Ensure it doesn't exist
      if (existsSync(getSocketDlxDir())) {
        safeDeleteSync(getSocketDlxDir(), { force: true })
      }
      await ensureDlxDir()
      expect(existsSync(getSocketDlxDir())).toBe(true)
    })

    it('should not throw if DLX directory already exists', async () => {
      await ensureDlxDir()
      await expect(ensureDlxDir()).resolves.not.toThrow()
    })

    it('sync version should create DLX directory if it does not exist', () => {
      // Ensure it doesn't exist
      if (existsSync(getSocketDlxDir())) {
        safeDeleteSync(getSocketDlxDir(), { force: true })
      }
      ensureDlxDirSync()
      expect(existsSync(getSocketDlxDir())).toBe(true)
    })

    it('sync version should not throw if DLX directory already exists', () => {
      ensureDlxDirSync()
      expect(() => ensureDlxDirSync()).not.toThrow()
    })
  })

  describe('isDlxPackageInstalled', () => {
    it('should return false when package is not installed', () => {
      expect(isDlxPackageInstalled(testPackageName)).toBe(false)
    })

    it('should return true when package is installed', async () => {
      // Create a mock installation
      const installedDir = getDlxInstalledPackageDir(testPackageName)
      await fsPromises.mkdir(installedDir, { recursive: true })
      expect(isDlxPackageInstalled(testPackageName)).toBe(true)
    })

    it('should handle scoped packages', async () => {
      const scopedPackage = '@socket/test'
      expect(isDlxPackageInstalled(scopedPackage)).toBe(false)
      const installedDir = getDlxInstalledPackageDir(scopedPackage)
      await fsPromises.mkdir(installedDir, { recursive: true })
      expect(isDlxPackageInstalled(scopedPackage)).toBe(true)
    })

    it('should handle empty package name', () => {
      expect(isDlxPackageInstalled('')).toBe(false)
    })
  })

  describe('listDlxPackages / listDlxPackagesAsync', () => {
    it('should return empty array when no packages are installed', () => {
      const packages = listDlxPackages()
      expect(packages).toEqual([])
    })

    it('should list installed packages', async () => {
      // Create mock installations
      await ensureDlxDir()
      const pkg1Dir = getDlxPackageDir('package-1')
      const pkg2Dir = getDlxPackageDir('package-2')
      await fsPromises.mkdir(pkg1Dir, { recursive: true })
      await fsPromises.mkdir(pkg2Dir, { recursive: true })

      const packages = listDlxPackages()
      expect(packages).toContain('package-1')
      expect(packages).toContain('package-2')
      expect(packages).toHaveLength(2)
    })

    it('should return sorted list of packages', async () => {
      // Create mock installations in reverse order
      await ensureDlxDir()
      const pkgZDir = getDlxPackageDir('z-package')
      const pkgADir = getDlxPackageDir('a-package')
      await fsPromises.mkdir(pkgZDir, { recursive: true })
      await fsPromises.mkdir(pkgADir, { recursive: true })

      const packages = listDlxPackages()
      expect(packages).toEqual(['a-package', 'z-package'])
    })

    it('should handle packages with special characters', async () => {
      await ensureDlxDir()
      const pkg1Dir = getDlxPackageDir('package-name_with.chars')
      const pkg2Dir = getDlxPackageDir('other-package_123')
      await fsPromises.mkdir(pkg1Dir, { recursive: true })
      await fsPromises.mkdir(pkg2Dir, { recursive: true })

      const packages = listDlxPackages()
      expect(packages).toContain('other-package_123')
      expect(packages).toContain('package-name_with.chars')
      expect(packages).toHaveLength(2)
    })

    it('should list scoped packages by scope directory', async () => {
      // When creating @scope/package, filesystem creates @scope dir and @scope/package subdir
      // listDlxPackages returns only top-level dirs, so it returns '@scope' not '@scope/package'
      await ensureDlxDir()
      const scopedPkgDir = getDlxPackageDir('@scope/package')
      await fsPromises.mkdir(scopedPkgDir, { recursive: true })

      const packages = listDlxPackages()
      expect(packages).toContain('@scope')
      expect(packages).toHaveLength(1)
    })

    it('should filter out non-directory entries', async () => {
      await ensureDlxDir()
      const pkgDir = getDlxPackageDir('real-package')
      await fsPromises.mkdir(pkgDir, { recursive: true })
      // Create a file in the DLX directory (should be ignored)
      const filePath = path.join(getSocketDlxDir(), 'some-file.txt')
      await fsPromises.writeFile(filePath, 'content')

      const packages = listDlxPackages()
      expect(packages).toEqual(['real-package'])
      expect(packages).toHaveLength(1)
    })

    it('async version should return empty array when no packages are installed', async () => {
      const packages = await listDlxPackagesAsync()
      expect(packages).toEqual([])
    })

    it('async version should list installed packages', async () => {
      // Create mock installations
      await ensureDlxDir()
      const pkg1Dir = getDlxPackageDir('package-1')
      const pkg2Dir = getDlxPackageDir('package-2')
      await fsPromises.mkdir(pkg1Dir, { recursive: true })
      await fsPromises.mkdir(pkg2Dir, { recursive: true })

      const packages = await listDlxPackagesAsync()
      expect(packages).toContain('package-1')
      expect(packages).toContain('package-2')
      expect(packages).toHaveLength(2)
    })

    it('async version should return sorted list', async () => {
      await ensureDlxDir()
      const pkgZDir = getDlxPackageDir('z-package')
      const pkgADir = getDlxPackageDir('a-package')
      const pkgMDir = getDlxPackageDir('m-package')
      await fsPromises.mkdir(pkgZDir, { recursive: true })
      await fsPromises.mkdir(pkgADir, { recursive: true })
      await fsPromises.mkdir(pkgMDir, { recursive: true })

      const packages = await listDlxPackagesAsync()
      expect(packages).toEqual(['a-package', 'm-package', 'z-package'])
    })
  })

  describe('removeDlxPackage / removeDlxPackageSync', () => {
    it('should remove installed package', async () => {
      // Create a mock installation
      const packageDir = getDlxPackageDir(testPackageName)
      await fsPromises.mkdir(packageDir, { recursive: true })
      expect(existsSync(packageDir)).toBe(true)

      await removeDlxPackage(testPackageName)
      expect(existsSync(packageDir)).toBe(false)
    })

    it('should not throw when removing non-existent package', async () => {
      // safeDelete handles non-existent files gracefully (force: true)
      await expect(
        removeDlxPackage('non-existent-package'),
      ).resolves.not.toThrow()
    })

    it('sync version should remove installed package', () => {
      // Create a mock installation
      const packageDir = getDlxPackageDir(testPackageName)
      mkdirSync(packageDir, { recursive: true })
      expect(existsSync(packageDir)).toBe(true)

      removeDlxPackageSync(testPackageName)
      expect(existsSync(packageDir)).toBe(false)
    })

    it('sync version should not throw when removing non-existent package', () => {
      // Removing a non-existent package should not throw (force: true)
      expect(() => removeDlxPackageSync('non-existent-package')).not.toThrow()
    })
  })

  describe('clearDlx / clearDlxSync', () => {
    it('should remove all DLX packages', async () => {
      // Create multiple mock installations
      await ensureDlxDir()
      const pkg1Dir = getDlxPackageDir('package-1')
      const pkg2Dir = getDlxPackageDir('package-2')
      await fsPromises.mkdir(pkg1Dir, { recursive: true })
      await fsPromises.mkdir(pkg2Dir, { recursive: true })

      expect(listDlxPackages()).toHaveLength(2)
      await clearDlx()
      expect(listDlxPackages()).toHaveLength(0)
    })

    it('should not throw when DLX directory is empty', async () => {
      await ensureDlxDir()
      await expect(clearDlx()).resolves.not.toThrow()
    })

    it('should not throw when DLX directory does not exist', async () => {
      // Ensure directory doesn't exist
      if (existsSync(getSocketDlxDir())) {
        safeDeleteSync(getSocketDlxDir(), { force: true })
      }
      await expect(clearDlx()).resolves.not.toThrow()
    })

    it('sync version should remove all DLX packages', () => {
      // Create multiple mock installations
      ensureDlxDirSync()
      const pkg1Dir = getDlxPackageDir('package-1')
      const pkg2Dir = getDlxPackageDir('package-2')
      mkdirSync(pkg1Dir, { recursive: true })
      mkdirSync(pkg2Dir, { recursive: true })

      expect(listDlxPackages()).toHaveLength(2)
      clearDlxSync()
      expect(listDlxPackages()).toHaveLength(0)
    })

    it('sync version should not throw when DLX directory is empty', () => {
      ensureDlxDirSync()
      expect(() => clearDlxSync()).not.toThrow()
    })

    it('sync version should not throw when DLX directory does not exist', () => {
      // Ensure directory doesn't exist
      if (existsSync(getSocketDlxDir())) {
        safeDeleteSync(getSocketDlxDir(), { force: true })
      }
      expect(() => clearDlxSync()).not.toThrow()
    })
  })
})
