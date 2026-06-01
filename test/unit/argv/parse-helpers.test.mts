/**
 * @file Unit tests for argv inspection helpers built on process.argv:
 *
 *   - getPositionalArgs() extracts positional arguments
 *   - hasFlag() checks for boolean flag presence Used by Socket CLI for
 *     command-line argument processing.
 */

import process from 'node:process'
import { getPositionalArgs, hasFlag } from '../../../src/argv/parse'
import { describe, expect, it } from 'vitest'

describe('argv/parse helpers', () => {
  describe('getPositionalArgs', () => {
    it('should extract positional args from start', () => {
      // Simulate process.argv = ['node', 'script.js', 'file1.js', 'file2.js']
      const originalArgv = process.argv
      try {
        process.argv = ['node', 'script.js', 'file1.js', 'file2.js']
        const result = getPositionalArgs()
        expect(result).toEqual(['file1.js', 'file2.js'])
      } finally {
        process.argv = originalArgv
      }
    })

    it('should stop at first flag', () => {
      const originalArgv = process.argv
      try {
        process.argv = [
          'node',
          'script.js',
          'file1.js',
          '--verbose',
          'file2.js',
        ]
        const result = getPositionalArgs()
        expect(result).toEqual(['file1.js'])
      } finally {
        process.argv = originalArgv
      }
    })

    it('should handle custom start index', () => {
      const originalArgv = process.argv
      try {
        process.argv = [
          'node',
          'script.js',
          'subcommand',
          'file1.js',
          'file2.js',
        ]
        const result = getPositionalArgs(3)
        expect(result).toEqual(['file1.js', 'file2.js'])
      } finally {
        process.argv = originalArgv
      }
    })

    it('should return empty array when no positionals', () => {
      const originalArgv = process.argv
      try {
        process.argv = ['node', 'script.js', '--flag']
        const result = getPositionalArgs()
        expect(result).toEqual([])
      } finally {
        process.argv = originalArgv
      }
    })

    it('should return empty array when all flags', () => {
      const originalArgv = process.argv
      try {
        process.argv = ['node', 'script.js', '--verbose', '--debug']
        const result = getPositionalArgs()
        expect(result).toEqual([])
      } finally {
        process.argv = originalArgv
      }
    })
  })

  describe('hasFlag', () => {
    it('should detect long flag', () => {
      const argv = ['node', 'script.js', '--verbose']
      expect(hasFlag('verbose', argv)).toBe(true)
    })

    it('should not match short flags (only long flags)', () => {
      const argv = ['node', 'script.js', '-v']
      expect(hasFlag('verbose', argv)).toBe(false)
    })

    it('should return false for missing flag', () => {
      const argv = ['node', 'script.js']
      expect(hasFlag('verbose', argv)).toBe(false)
    })

    it('should use process.argv by default', () => {
      const originalArgv = process.argv
      try {
        process.argv = ['node', 'script.js', '--verbose']
        expect(hasFlag('verbose')).toBe(true)
      } finally {
        process.argv = originalArgv
      }
    })

    it('should handle flags with values', () => {
      const argv = ['node', 'script.js', '--name', 'test']
      expect(hasFlag('name', argv)).toBe(true)
    })

    it('should handle multiple flags', () => {
      const argv = ['node', 'script.js', '--verbose', '--debug', '--quiet']
      expect(hasFlag('verbose', argv)).toBe(true)
      expect(hasFlag('debug', argv)).toBe(true)
      expect(hasFlag('quiet', argv)).toBe(true)
    })

    it('should not match partial flags', () => {
      const argv = ['node', 'script.js', '--verbosity']
      expect(hasFlag('verbose', argv)).toBe(false)
    })

    it('should handle single letter long flags', () => {
      const argv = ['node', 'script.js', '--h']
      expect(hasFlag('h', argv)).toBe(true)
    })
  })
})
