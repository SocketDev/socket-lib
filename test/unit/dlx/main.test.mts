/**
 * @fileoverview Unit tests for DLX (Download and Execute) cache management utilities.
 *
 * Tests DLX cache directory and package management:
 * - getDlxPackageDir(), getDlxPackageJsonPath() path resolution
 * - ensureDlxDir(), ensureDlxDirSync() cache directory creation
 * - clearDlx(), clearDlxSync() cache cleanup
 * - dlxDirExists(), dlxDirExistsAsync() cache existence checks
 * - generateCacheKey() creates unique cache keys for packages
 * Used by Socket CLI for pnpm dlx / npx-style package execution.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { generateCacheKey } from '@socketsecurity/lib/dlx/cache'
import {
  clearDlx,
  clearDlxSync,
  dlxDirExists,
  dlxDirExistsAsync,
  ensureDlxDir,
  ensureDlxDirSync,
} from '@socketsecurity/lib/dlx/dir'
import {
  isDlxPackageInstalled,
  isDlxPackageInstalledAsync,
  listDlxPackages,
  listDlxPackagesAsync,
  removeDlxPackage,
  removeDlxPackageSync,
} from '@socketsecurity/lib/dlx/packages'
import {
  getDlxInstalledPackageDir,
  getDlxPackageDir,
  getDlxPackageJsonPath,
  getDlxPackageNodeModulesDir,
  isInSocketDlx,
} from '@socketsecurity/lib/dlx/paths'
import { getSocketDlxDir } from '@socketsecurity/lib/paths/socket'

describe.sequential('dlx', () => {
  const testPackageName = 'test-package'
  let originalEnv: string | undefined
  let testDlxDir: string

  beforeEach(async () => {
    // Save original env and create isolated test directory
    originalEnv = process.env.SOCKET_DLX_DIR
    testDlxDir = path.join(os.tmpdir(), `socket-dlx-test-${randomUUID()}`)
    process.env.SOCKET_DLX_DIR = testDlxDir

    // Clean up any existing test artifacts
    await clearDlx().catch(() => {})
  })

  afterEach(async () => {
    // Clean up after tests
    await clearDlx().catch(() => {})

    // Remove test directory
    try {
      await fs.promises.rm(testDlxDir, { recursive: true, force: true })
    } catch {}

    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.SOCKET_DLX_DIR
    } else {
      process.env.SOCKET_DLX_DIR = originalEnv
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

  describe('dlxDirExists / dlxDirExistsAsync', () => {
    it('should return false when DLX directory does not exist', () => {
      // Ensure it doesn't exist
      if (fs.existsSync(getSocketDlxDir())) {
        fs.rmSync(getSocketDlxDir(), { recursive: true, force: true })
      }
      expect(dlxDirExists()).toBe(false)
    })

    it('should return true when DLX directory exists', async () => {
      await ensureDlxDir()
      expect(dlxDirExists()).toBe(true)
    })

    it('async version should return false when directory does not exist', async () => {
      // Ensure it doesn't exist (use async version for consistency)
      try {
        await fs.promises.rm(getSocketDlxDir(), {
          recursive: true,
          force: true,
        })
      } catch {
        // Directory might not exist, which is fine
      }
      expect(await dlxDirExistsAsync()).toBe(false)
    })

    it('async version should return true when directory exists', async () => {
      await ensureDlxDir()
      expect(await dlxDirExistsAsync()).toBe(true)
    })
  })

  describe('ensureDlxDir / ensureDlxDirSync', () => {
    it('should create DLX directory if it does not exist', async () => {
      // Ensure it doesn't exist
      if (fs.existsSync(getSocketDlxDir())) {
        fs.rmSync(getSocketDlxDir(), { recursive: true, force: true })
      }
      await ensureDlxDir()
      expect(fs.existsSync(getSocketDlxDir())).toBe(true)
    })

    it('should not throw if DLX directory already exists', async () => {
      await ensureDlxDir()
      await expect(ensureDlxDir()).resolves.not.toThrow()
    })

    it('sync version should create DLX directory if it does not exist', () => {
      // Ensure it doesn't exist
      if (fs.existsSync(getSocketDlxDir())) {
        fs.rmSync(getSocketDlxDir(), { recursive: true, force: true })
      }
      ensureDlxDirSync()
      expect(fs.existsSync(getSocketDlxDir())).toBe(true)
    })

    it('sync version should not throw if DLX directory already exists', () => {
      ensureDlxDirSync()
      expect(() => ensureDlxDirSync()).not.toThrow()
    })
  })

  describe('getDlxPackageDir', () => {
    it('should return path to package directory', () => {
      const packageDir = getDlxPackageDir(testPackageName)
      expect(packageDir).toContain(getSocketDlxDir())
      expect(packageDir).toContain(testPackageName)
    })

    it('should normalize path separators', () => {
      const packageDir = getDlxPackageDir(testPackageName)
      // Path should not contain backslashes on any platform after normalization
      expect(packageDir).not.toContain('\\')
    })

    it('should handle scoped package names', () => {
      const scopedPackage = '@socket/cli'
      const packageDir = getDlxPackageDir(scopedPackage)
      expect(packageDir).toContain(getSocketDlxDir())
      expect(packageDir).toContain('@socket/cli')
    })

    it('should handle package names with special characters', () => {
      const specialPackage = 'package-name_with.chars'
      const packageDir = getDlxPackageDir(specialPackage)
      expect(packageDir).toContain(getSocketDlxDir())
      expect(packageDir).toContain(specialPackage)
    })

    it('should handle empty package name', () => {
      const packageDir = getDlxPackageDir('')
      expect(packageDir).toContain(getSocketDlxDir())
    })
  })

  describe('getDlxPackageNodeModulesDir', () => {
    it('should return path to node_modules directory', () => {
      const nodeModulesDir = getDlxPackageNodeModulesDir(testPackageName)
      expect(nodeModulesDir).toContain(getSocketDlxDir())
      expect(nodeModulesDir).toContain(testPackageName)
      expect(nodeModulesDir).toContain('node_modules')
    })

    it('should handle scoped packages', () => {
      const scopedPackage = '@socket/test'
      const nodeModulesDir = getDlxPackageNodeModulesDir(scopedPackage)
      expect(nodeModulesDir).toContain(getSocketDlxDir())
      expect(nodeModulesDir).toContain('node_modules')
    })

    it('should handle empty package name', () => {
      const nodeModulesDir = getDlxPackageNodeModulesDir('')
      expect(nodeModulesDir).toContain(getSocketDlxDir())
      expect(nodeModulesDir).toContain('node_modules')
    })
  })

  describe('getDlxInstalledPackageDir', () => {
    it('should return path to installed package directory', () => {
      const installedDir = getDlxInstalledPackageDir(testPackageName)
      expect(installedDir).toContain(getSocketDlxDir())
      expect(installedDir).toContain(testPackageName)
      expect(installedDir).toContain('node_modules')
    })

    it('should handle scoped packages', () => {
      const scopedPackage = '@socket/test'
      const installedDir = getDlxInstalledPackageDir(scopedPackage)
      expect(installedDir).toContain(getSocketDlxDir())
      expect(installedDir).toContain('@socket/test')
    })
  })

  describe('getDlxPackageJsonPath', () => {
    it('should return path to package.json', () => {
      const packageJsonPath = getDlxPackageJsonPath(testPackageName)
      expect(packageJsonPath).toContain(getSocketDlxDir())
      expect(packageJsonPath).toContain(testPackageName)
      expect(packageJsonPath).toContain('package.json')
    })

    it('should handle scoped packages', () => {
      const scopedPackage = '@socket/test'
      const packageJsonPath = getDlxPackageJsonPath(scopedPackage)
      expect(packageJsonPath).toContain(getSocketDlxDir())
      expect(packageJsonPath).toContain('package.json')
    })

    it('should handle empty package name', () => {
      const packageJsonPath = getDlxPackageJsonPath('')
      expect(packageJsonPath).toContain(getSocketDlxDir())
      expect(packageJsonPath).toContain('package.json')
    })
  })

  describe('isInSocketDlx', () => {
    it('should return true for paths within DLX directory', () => {
      const dlxPath = path.join(
        getSocketDlxDir(),
        'some-package',
        'bin',
        'binary',
      )
      expect(isInSocketDlx(dlxPath)).toBe(true)
    })

    it('should return false for paths outside DLX directory', () => {
      expect(isInSocketDlx('/usr/local/bin/binary')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isInSocketDlx('')).toBe(false)
    })

    it('should handle relative paths', () => {
      const relativePath = 'some/relative/path'
      const result = isInSocketDlx(relativePath)
      expect(typeof result).toBe('boolean')
    })

    it('should handle paths with trailing separators', () => {
      const dlxPath = path.join(getSocketDlxDir(), 'package', '')
      expect(isInSocketDlx(dlxPath)).toBe(true)
    })

    it('should return false for exact DLX directory path', () => {
      // The DLX directory itself is not "inside" the DLX directory
      expect(isInSocketDlx(getSocketDlxDir())).toBe(false)
    })

    it('should return true for paths inside DLX with trailing slash', () => {
      // A path with trailing slash after DLX dir is considered inside
      const insidePath = path.join(getSocketDlxDir(), 'anything')
      expect(isInSocketDlx(insidePath)).toBe(true)
    })

    it('should handle nested paths', () => {
      const nestedPath = path.join(
        getSocketDlxDir(),
        'pkg',
        'node_modules',
        'dep',
        'lib',
        'file.js',
      )
      expect(isInSocketDlx(nestedPath)).toBe(true)
    })

    it('should handle similar but different paths', () => {
      const similarPath = `${getSocketDlxDir()}-other/package`
      expect(isInSocketDlx(similarPath)).toBe(false)
    })

    it('should handle paths with special characters', () => {
      const specialPath = path.join(getSocketDlxDir(), '@scope/package', 'bin')
      expect(isInSocketDlx(specialPath)).toBe(true)
    })
  })

  describe('isDlxPackageInstalled / isDlxPackageInstalledAsync', () => {
    it('should return false when package is not installed', () => {
      expect(isDlxPackageInstalled(testPackageName)).toBe(false)
    })

    it('should return true when package is installed', async () => {
      // Create a mock installation
      const installedDir = getDlxInstalledPackageDir(testPackageName)
      await fs.promises.mkdir(installedDir, { recursive: true })
      expect(isDlxPackageInstalled(testPackageName)).toBe(true)
    })

    it('async version should return false when package is not installed', async () => {
      expect(await isDlxPackageInstalledAsync(testPackageName)).toBe(false)
    })

    it('async version should return true when package is installed', async () => {
      // Create a mock installation
      const installedDir = getDlxInstalledPackageDir(testPackageName)
      await fs.promises.mkdir(installedDir, { recursive: true })
      expect(await isDlxPackageInstalledAsync(testPackageName)).toBe(true)
    })

    it('should handle scoped packages', async () => {
      const scopedPackage = '@socket/test'
      expect(isDlxPackageInstalled(scopedPackage)).toBe(false)
      const installedDir = getDlxInstalledPackageDir(scopedPackage)
      await fs.promises.mkdir(installedDir, { recursive: true })
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
      await fs.promises.mkdir(pkg1Dir, { recursive: true })
      await fs.promises.mkdir(pkg2Dir, { recursive: true })

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
      await fs.promises.mkdir(pkgZDir, { recursive: true })
      await fs.promises.mkdir(pkgADir, { recursive: true })

      const packages = listDlxPackages()
      expect(packages).toEqual(['a-package', 'z-package'])
    })

    it('should handle packages with special characters', async () => {
      await ensureDlxDir()
      const pkg1Dir = getDlxPackageDir('package-name_with.chars')
      const pkg2Dir = getDlxPackageDir('other-package_123')
      await fs.promises.mkdir(pkg1Dir, { recursive: true })
      await fs.promises.mkdir(pkg2Dir, { recursive: true })

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
      await fs.promises.mkdir(scopedPkgDir, { recursive: true })

      const packages = listDlxPackages()
      expect(packages).toContain('@scope')
      expect(packages).toHaveLength(1)
    })

    it('should filter out non-directory entries', async () => {
      await ensureDlxDir()
      const pkgDir = getDlxPackageDir('real-package')
      await fs.promises.mkdir(pkgDir, { recursive: true })
      // Create a file in the DLX directory (should be ignored)
      const filePath = path.join(getSocketDlxDir(), 'some-file.txt')
      await fs.promises.writeFile(filePath, 'content')

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
      await fs.promises.mkdir(pkg1Dir, { recursive: true })
      await fs.promises.mkdir(pkg2Dir, { recursive: true })

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
      await fs.promises.mkdir(pkgZDir, { recursive: true })
      await fs.promises.mkdir(pkgADir, { recursive: true })
      await fs.promises.mkdir(pkgMDir, { recursive: true })

      const packages = await listDlxPackagesAsync()
      expect(packages).toEqual(['a-package', 'm-package', 'z-package'])
    })
  })

  describe('removeDlxPackage / removeDlxPackageSync', () => {
    it('should remove installed package', async () => {
      // Create a mock installation
      const packageDir = getDlxPackageDir(testPackageName)
      await fs.promises.mkdir(packageDir, { recursive: true })
      expect(fs.existsSync(packageDir)).toBe(true)

      await removeDlxPackage(testPackageName)
      expect(fs.existsSync(packageDir)).toBe(false)
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
      fs.mkdirSync(packageDir, { recursive: true })
      expect(fs.existsSync(packageDir)).toBe(true)

      removeDlxPackageSync(testPackageName)
      expect(fs.existsSync(packageDir)).toBe(false)
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
      await fs.promises.mkdir(pkg1Dir, { recursive: true })
      await fs.promises.mkdir(pkg2Dir, { recursive: true })

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
      if (fs.existsSync(getSocketDlxDir())) {
        fs.rmSync(getSocketDlxDir(), { recursive: true, force: true })
      }
      await expect(clearDlx()).resolves.not.toThrow()
    })

    it('sync version should remove all DLX packages', () => {
      // Create multiple mock installations
      ensureDlxDirSync()
      const pkg1Dir = getDlxPackageDir('package-1')
      const pkg2Dir = getDlxPackageDir('package-2')
      fs.mkdirSync(pkg1Dir, { recursive: true })
      fs.mkdirSync(pkg2Dir, { recursive: true })

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
      if (fs.existsSync(getSocketDlxDir())) {
        fs.rmSync(getSocketDlxDir(), { recursive: true, force: true })
      }
      expect(() => clearDlxSync()).not.toThrow()
    })
  })
})
