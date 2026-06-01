/**
 * @file Unit tests for relative path resolution. Tests relativeResolve(),
 *   which resolves a path relative to a base directory:
 *
 *   - Basic relative paths between sibling, parent, and child directories
 *   - Root path handling
 *   - Complex scenarios with . and .. segments and pre-resolution normalization
 *   - Windows drive paths (case-insensitive)
 *   - Relative inputs resolved against cwd Critical for cross-platform file
 *     operations.
 */

import process from 'node:process'
import { relativeResolve } from '../../../src/paths/resolve'
import { describe, expect, it } from 'vitest'

describe('relativeResolve', () => {
  describe('Basic relative paths', () => {
    it('should calculate relative path between directories', () => {
      const result = relativeResolve('/foo/bar', '/foo/baz')
      expect(result).toBe('../baz')
    })

    it('should calculate relative path to parent', () => {
      const result = relativeResolve('/foo/bar/baz', '/foo')
      expect(result).toBe('../..')
    })

    it('should calculate relative path to child', () => {
      const result = relativeResolve('/foo', '/foo/bar')
      expect(result).toBe('bar')
    })

    it('should return empty string for same paths', () => {
      expect(relativeResolve('/foo/bar', '/foo/bar')).toBe('')
    })
  })

  describe('Root paths', () => {
    it('should handle root paths', () => {
      const result = relativeResolve('/', '/foo/bar')
      expect(result).toBe('foo/bar')
    })

    it('should handle path to root', () => {
      const result = relativeResolve('/foo/bar', '/')
      expect(result).toBe('../..')
    })
  })

  describe('Complex scenarios', () => {
    it('should handle paths with . and ..', () => {
      const result = relativeResolve('/foo/./bar', '/foo/baz')
      expect(result).toBe('../baz')
    })

    it('should normalize before calculating', () => {
      const result = relativeResolve('/foo/bar/../baz', '/foo/qux')
      expect(result).toBe('../qux')
    })

    it('should handle deeply nested paths', () => {
      const result = relativeResolve('/a/b/c/d/e', '/a/b/f/g')
      expect(result).toBe('../../../f/g')
    })
  })

  if (process.platform === 'win32') {
    describe('Windows paths', () => {
      it('should handle Windows paths', () => {
        const result = relativeResolve('C:\\foo\\bar', 'C:\\foo\\baz')
        expect(result).toBe('../baz')
      })

      it('should be case-insensitive on Windows', () => {
        const result = relativeResolve('C:\\Foo\\bar', 'C:\\foo\\baz')
        expect(result).toBe('../baz')
      })
    })
  }

  describe('Relative input paths', () => {
    it('should resolve relative inputs to absolute', () => {
      // These will be resolved against cwd, so result depends on cwd
      const result = relativeResolve('foo/bar', 'foo/baz')
      expect(result).toBe('../baz')
    })
  })
})
