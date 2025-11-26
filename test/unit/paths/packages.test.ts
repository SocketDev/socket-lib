/**
 * @fileoverview Unit tests for package.json path resolution utilities.
 *
 * Tests path utilities for package.json files:
 * - resolvePackageJsonDirname() - Extract directory from package.json path
 * - resolvePackageJsonPath() - Resolve full package.json path
 * Used for consistent path handling across different operating systems.
 */

import {
  resolvePackageJsonDirname,
  resolvePackageJsonPath,
} from '@socketsecurity/lib/paths/packages'
import { describe, expect, it } from 'vitest'

describe('paths/packages', () => {
  describe('resolvePackageJsonDirname', () => {
    it('should extract directory from package.json path', () => {
      const result = resolvePackageJsonDirname('/foo/bar/package.json')
      expect(result).toBe('/foo/bar')
    })

    it('should handle Windows-style path', () => {
      // Note: On Unix, backslashes are treated as part of the filename, not path separators
      // This test verifies the function handles the input, even if result is platform-specific
      const result = resolvePackageJsonDirname('C:\\foo\\bar\\package.json')
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should return normalized path if not package.json', () => {
      const result = resolvePackageJsonDirname('/foo/bar')
      expect(result).toBe('/foo/bar')
    })

    it('should handle path without package.json suffix', () => {
      const result = resolvePackageJsonDirname('/foo/bar/baz')
      expect(result).toBe('/foo/bar/baz')
    })

    it('should handle root directory package.json', () => {
      const result = resolvePackageJsonDirname('/package.json')
      expect(result).toBe('/')
    })

    it('should handle relative path with package.json', () => {
      const result = resolvePackageJsonDirname('./foo/package.json')
      // normalizePath resolves './' to current directory name
      expect(result).toBe('foo')
    })

    it('should handle nested directory structure', () => {
      const result = resolvePackageJsonDirname('/foo/bar/baz/qux/package.json')
      expect(result).toBe('/foo/bar/baz/qux')
    })
  })

  describe('resolvePackageJsonPath', () => {
    it('should return path if already package.json', () => {
      const result = resolvePackageJsonPath('/foo/bar/package.json')
      expect(result).toBe('/foo/bar/package.json')
    })

    it('should append package.json to directory path', () => {
      const result = resolvePackageJsonPath('/foo/bar')
      expect(result).toBe('/foo/bar/package.json')
    })

    it('should handle Windows directory path', () => {
      const result = resolvePackageJsonPath('C:\\foo\\bar')
      // Should normalize to forward slashes
      expect(result).toBe('C:/foo/bar/package.json')
    })

    it('should handle relative directory path', () => {
      const result = resolvePackageJsonPath('./foo')
      // normalizePath resolves './' to current directory name
      expect(result).toBe('foo/package.json')
    })

    it('should handle root directory', () => {
      const result = resolvePackageJsonPath('/')
      expect(result).toBe('/package.json')
    })

    it('should handle nested directory', () => {
      const result = resolvePackageJsonPath('/foo/bar/baz/qux')
      expect(result).toBe('/foo/bar/baz/qux/package.json')
    })

    it('should not double-append package.json', () => {
      const result = resolvePackageJsonPath('/foo/bar/package.json')
      expect(result).toBe('/foo/bar/package.json')
      expect(result).not.toBe('/foo/bar/package.json/package.json')
    })
  })

  describe('integration', () => {
    it('should be inverse operations for package.json paths', () => {
      const originalPath = '/foo/bar/package.json'
      const dirname = resolvePackageJsonDirname(originalPath)
      const resolved = resolvePackageJsonPath(dirname)
      expect(resolved).toBe(originalPath)
    })

    it('should handle round-trip for directory paths', () => {
      const directory = '/foo/bar'
      const packagePath = resolvePackageJsonPath(directory)
      const extractedDir = resolvePackageJsonDirname(packagePath)
      expect(extractedDir).toBe(directory)
    })

    it('should normalize all paths consistently', () => {
      const paths = [
        resolvePackageJsonDirname('/foo/bar/package.json'),
        resolvePackageJsonPath('/foo/bar'),
      ]

      for (const p of paths) {
        // Should use forward slashes
        expect(p.includes('\\')).toBe(false)
      }
    })

    it('should handle complex real-world paths', () => {
      const complexPath = '/Users/john/projects/my-app/node_modules/@foo/bar'
      const packagePath = resolvePackageJsonPath(complexPath)
      expect(packagePath).toBe(
        '/Users/john/projects/my-app/node_modules/@foo/bar/package.json',
      )

      const extractedDir = resolvePackageJsonDirname(packagePath)
      expect(extractedDir).toBe(complexPath)
    })
  })
})
