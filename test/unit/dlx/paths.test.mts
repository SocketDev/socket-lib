/**
 * @file Unit tests for DLX (Download and Execute) path-resolution utilities.
 *   Tests pure path construction for the DLX cache:
 *
 *   - getDlxPackageDir() resolves a package's cache directory
 *   - getDlxPackageNodeModulesDir() resolves the package node_modules directory
 *   - getDlxInstalledPackageDir() resolves the installed package directory
 *   - getDlxPackageJsonPath() resolves a package's package.json path
 *   - isInSocketDlx() classifies paths as inside or outside the DLX directory
 *
 *   The directory-lifecycle and package-management tests live in main.test.mts.
 */

import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSocketDlxDir } from '@socketsecurity/lib-stable/paths/socket'

import {
  getDlxInstalledPackageDir,
  getDlxPackageDir,
  getDlxPackageJsonPath,
  getDlxPackageNodeModulesDir,
  isInSocketDlx,
} from '../../../src/dlx/paths'
import { safeDelete } from '../../../src/fs/safe'

describe.sequential('dlx paths', () => {
  const testPackageName = 'test-package'
  let originalEnv: string | undefined
  let testDlxDir: string

  beforeEach(() => {
    // Save original env and create isolated test directory
    originalEnv = process.env['SOCKET_DLX_DIR']
    testDlxDir = path.join(os.tmpdir(), `socket-dlx-test-${crypto.randomUUID()}`)
    process.env['SOCKET_DLX_DIR'] = testDlxDir
  })

  afterEach(async () => {
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
})
