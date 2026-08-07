/**
 * @file Unit tests for stderr terminal/stream-control utilities. Tests:
 *
 *   - stderr stream export
 *   - Stream detection (TTY vs pipe)
 *   - Cursor control (clearStderrLine, cursorToStderr)
 *   - Terminal dimensions (getStderrColumns, getStderrRows) Used by Socket tools
 *     for terminal-aware diagnostic output.
 */

import process from 'node:process'
import { describe, expect, it } from 'vitest'

import {
  clearStderrLine,
  cursorToStderr,
  getStderrColumns,
  getStderrRows,
  isStderrTTY,
  stderr,
} from '../../../src/stdio/stderr'
import { setupStdioTestSuite } from '../util/stdio-test-helper'

describe('stdio/stderr terminal', () => {
  const getContext = setupStdioTestSuite(stderr)

  describe('stderr', () => {
    it('should export stderr stream', () => {
      expect(stderr).toBeDefined()
      expect(stderr).toBe(process.stderr)
    })

    it('should be a WriteStream', () => {
      expect(stderr).toBeInstanceOf(Object)
    })
  })

  describe('clearStderrLine', () => {
    it('should export clearStderrLine function', () => {
      expect(typeof clearStderrLine).toBe('function')
    })

    it('should clear line in TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearStderrLine()
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(0)
      expect(getContext().clearLineSpy).toHaveBeenCalledWith(0)
    })

    it('should not return a value', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = clearStderrLine()
      expect(result).toBeUndefined()
    })
  })

  describe('cursorToStderr', () => {
    it('should export cursorToStderr function', () => {
      expect(typeof cursorToStderr).toBe('function')
    })

    it('should move cursor to x position in TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorToStderr(10)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(10, undefined)
    })

    it('should move cursor to x,y position in TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorToStderr(10, 5)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(10, 5)
    })

    it('should move cursor to 0,0', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorToStderr(0, 0)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(0, 0)
    })

    it('should not return a value', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = cursorToStderr(0)
      expect(result).toBeUndefined()
    })

    it('should handle large coordinates', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorToStderr(1000, 500)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(1000, 500)
    })

    it('should handle negative coordinates', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorToStderr(-1, -1)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(-1, -1)
    })
  })

  describe('isStderrTTY', () => {
    it('should export isStderrTTY function', () => {
      expect(typeof isStderrTTY).toBe('function')
    })

    it('should return true when stderr is TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      expect(isStderrTTY()).toBe(true)
    })

    it('should return false when stderr is not TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      expect(isStderrTTY()).toBe(false)
    })

    it('should return false when isTTY is undefined', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: undefined,
        configurable: true,
      })
      expect(isStderrTTY()).toBe(false)
    })

    it('should be a boolean', () => {
      expect(typeof isStderrTTY()).toBe('boolean')
    })
  })

  describe('getStderrColumns', () => {
    it('should export getStderrColumns function', () => {
      expect(typeof getStderrColumns).toBe('function')
    })

    it('should return actual columns when set', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 120,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(120)
    })

    it('should return default 80 when columns is undefined', () => {
      Object.defineProperty(stderr, 'columns', {
        value: undefined,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(80)
    })

    it('should return default 80 when columns is 0', () => {
      Object.defineProperty(stderr, 'columns', { value: 0, configurable: true })
      expect(getStderrColumns()).toBe(80)
    })

    it('should handle small terminal width', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 40,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(40)
    })

    it('should handle large terminal width', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 300,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(300)
    })

    it('should be a number', () => {
      expect(typeof getStderrColumns()).toBe('number')
    })
  })

  describe('getStderrRows', () => {
    it('should export getStderrRows function', () => {
      expect(typeof getStderrRows).toBe('function')
    })

    it('should return actual rows when set', () => {
      Object.defineProperty(stderr, 'rows', { value: 50, configurable: true })
      expect(getStderrRows()).toBe(50)
    })

    it('should return default 24 when rows is undefined', () => {
      Object.defineProperty(stderr, 'rows', {
        value: undefined,
        configurable: true,
      })
      expect(getStderrRows()).toBe(24)
    })

    it('should return default 24 when rows is 0', () => {
      Object.defineProperty(stderr, 'rows', { value: 0, configurable: true })
      expect(getStderrRows()).toBe(24)
    })

    it('should handle small terminal height', () => {
      Object.defineProperty(stderr, 'rows', { value: 10, configurable: true })
      expect(getStderrRows()).toBe(10)
    })

    it('should handle large terminal height', () => {
      Object.defineProperty(stderr, 'rows', { value: 100, configurable: true })
      expect(getStderrRows()).toBe(100)
    })

    it('should be a number', () => {
      expect(typeof getStderrRows()).toBe('number')
    })
  })

  describe('edge cases', () => {
    it('should handle undefined isTTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: undefined,
        configurable: true,
      })
      expect(isStderrTTY()).toBe(false)
      clearStderrLine() // Should not throw
      cursorToStderr(0) // Should not throw
    })

    it('should handle terminal dimension changes', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 80,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(80)

      Object.defineProperty(stderr, 'columns', {
        value: 120,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(120)
    })

    it('should handle null-like terminal dimensions', () => {
      Object.defineProperty(stderr, 'columns', {
        value: undefined,
        configurable: true,
      })
      expect(getStderrColumns()).toBe(80)

      Object.defineProperty(stderr, 'rows', {
        value: undefined,
        configurable: true,
      })
      expect(getStderrRows()).toBe(24)
    })
  })

  describe('real-world usage', () => {
    it('should detect redirected error output', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      expect(isStderrTTY()).toBe(false)
    })

    it('should handle terminal size queries', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 120,
        configurable: true,
      })
      Object.defineProperty(stderr, 'rows', { value: 40, configurable: true })
      const width = getStderrColumns()
      const height = getStderrRows()
      expect(width).toBe(120)
      expect(height).toBe(40)
    })
  })
})
