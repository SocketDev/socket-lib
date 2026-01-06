/**
 * @fileoverview Unit tests for which binary resolution utilities.
 *
 * Tests binary resolution using `which`:
 * - which() async binary resolution in PATH
 * - whichSync() synchronous binary resolution
 * - Path detection (absolute, relative, bare names)
 * - Cross-platform binary resolution
 */

import { which, whichSync } from '@socketsecurity/lib/bin'
import { describe, expect, it } from 'vitest'

describe('which', () => {
  describe('whichSync', () => {
    it('should resolve binary name to full path', () => {
      // node should always be available in PATH when running tests
      const result = whichSync('node')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      if (result) {
        // Result should be an absolute path
        expect(result).toMatch(/node(\.exe)?$/i)
      }
    })

    it('should return absolute paths as-is', () => {
      const absolutePath = '/usr/bin/node'
      const result = whichSync(absolutePath)
      expect(result).toBe(absolutePath)
    })

    it('should return relative paths as-is', () => {
      const relativePath = './node'
      const result = whichSync(relativePath)
      expect(result).toBe(relativePath)
    })

    it('should return relative paths with .. as-is', () => {
      const relativePath = '../bin/node'
      const result = whichSync(relativePath)
      expect(result).toBe(relativePath)
    })

    it('should return null for non-existent binary', () => {
      const result = whichSync('this-binary-definitely-does-not-exist-12345')
      expect(result).toBeNull()
    })

    it('should handle Windows-style paths', () => {
      if (process.platform === 'win32') {
        const windowsPath = 'C:\\Windows\\System32\\cmd.exe'
        const result = whichSync(windowsPath)
        expect(result).toBe(windowsPath)
      }
    })

    it('should handle paths with separators', () => {
      const pathWithSeparator = './bin/script'
      const result = whichSync(pathWithSeparator)
      expect(result).toBe(pathWithSeparator)
    })

    it('should handle bare binary names', () => {
      // npm should be available in CI/development environments
      const result = whichSync('npm')
      // Either found in PATH or null, but should not throw
      expect(result === null || typeof result === 'string').toBe(true)
    })

    it('should pass through options to underlying which', () => {
      // Test that options are passed correctly
      const result = whichSync('node', { all: false })
      expect(result === null || typeof result === 'string').toBe(true)
    })
  })

  describe('which', () => {
    it('should resolve binary name to full path asynchronously', async () => {
      const result = await which('node')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
      if (result) {
        expect(result).toMatch(/node(\.exe)?$/i)
      }
    })

    it('should return absolute paths as-is', async () => {
      const absolutePath = '/usr/bin/node'
      const result = await which(absolutePath)
      expect(result).toBe(absolutePath)
    })

    it('should return relative paths as-is', async () => {
      const relativePath = './node'
      const result = await which(relativePath)
      expect(result).toBe(relativePath)
    })

    it('should return relative paths with .. as-is', async () => {
      const relativePath = '../bin/node'
      const result = await which(relativePath)
      expect(result).toBe(relativePath)
    })

    it('should return null for non-existent binary', async () => {
      const result = await which('this-binary-definitely-does-not-exist-12345')
      expect(result).toBeNull()
    })

    it('should handle Windows-style paths', async () => {
      if (process.platform === 'win32') {
        const windowsPath = 'C:\\Windows\\System32\\cmd.exe'
        const result = await which(windowsPath)
        expect(result).toBe(windowsPath)
      }
    })

    it('should handle paths with separators', async () => {
      const pathWithSeparator = './bin/script'
      const result = await which(pathWithSeparator)
      expect(result).toBe(pathWithSeparator)
    })

    it('should handle bare binary names', async () => {
      const result = await which('npm')
      // Either found in PATH or null, but should not throw
      expect(result === null || typeof result === 'string').toBe(true)
    })

    it('should pass through options to underlying which', async () => {
      const result = await which('node', { all: false })
      expect(result === null || typeof result === 'string').toBe(true)
    })
  })

  describe('path detection', () => {
    it('should detect scoped package names vs paths', () => {
      // @scope/name should NOT be treated as a path
      const scopedPackage = '@scope/package'
      const result = whichSync(scopedPackage)
      // Should be null since it's not in PATH and not a path
      expect(result).toBeNull()
    })

    it('should detect scoped paths', () => {
      // @scope/name/subpath should be treated as a path
      const scopedPath = '@scope/package/file.js'
      const result = whichSync(scopedPath)
      // Should return as-is since it's a path
      expect(result).toBe(scopedPath)
    })

    it('should handle current directory marker', () => {
      const currentDir = '.'
      // '.' is treated as a path
      const result = whichSync(currentDir)
      expect(result).toBe(currentDir)
    })

    it('should handle parent directory marker', () => {
      const parentDir = '..'
      // '..' is treated as a path
      const result = whichSync(parentDir)
      expect(result).toBe(parentDir)
    })
  })
})
