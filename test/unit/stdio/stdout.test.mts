/**
 * @file Unit tests for stdout stream output utilities. Tests:
 *
 *   - writeLine() / write() write to the stdout stream
 *   - clearLine() / cursorTo() / clearScreenDown() terminal control
 *   - isTTY() stream detection (TTY vs pipe)
 *   - getColumns() / getRows() terminal dimension queries Cursor lifecycle
 *     (hideCursor/showCursor/ensureCursorOnExit) and scenario tests live in
 *     stdout-cursor.test.mts.
 */

import process from 'node:process'
import { describe, expect, it } from 'vitest'

import {
  clearLine,
  clearScreenDown,
  cursorTo,
  getColumns,
  getRows,
  isTTY,
  stdout,
  write,
  writeLine,
} from '../../../src/stdio/stdout'
import { setupStdioTestSuite } from '../util/stdio-test-helper'

describe('stdio/stdout', () => {
  const getContext = setupStdioTestSuite(stdout)

  describe('stdout', () => {
    it('should export stdout stream', () => {
      expect(stdout).toBeDefined()
      expect(stdout).toBe(process.stdout)
    })

    it('should be a WriteStream', () => {
      expect(stdout).toBeInstanceOf(Object)
    })
  })

  describe('writeLine', () => {
    it('should export writeLine function', () => {
      expect(typeof writeLine).toBe('function')
    })

    it('should write text with newline', () => {
      writeLine('Hello, world!')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Hello, world!\n')
    })

    it('should write empty line when no text provided', () => {
      writeLine()
      expect(getContext().writeSpy).toHaveBeenCalledWith('\n')
    })

    it('should write empty string with newline', () => {
      writeLine('')
      expect(getContext().writeSpy).toHaveBeenCalledWith('\n')
    })

    it('should handle multiline text', () => {
      writeLine('Line 1\nLine 2')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Line 1\nLine 2\n')
    })

    it('should handle special characters', () => {
      writeLine('Tab\tNewline')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Tab\tNewline\n')
    })

    it('should handle Unicode characters', () => {
      writeLine('Hello 世界')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Hello 世界\n')
    })

    it('should handle emojis', () => {
      // oxlint-disable-next-line socket/no-status-emoji -- test asserts on emoji passthrough in output.
      writeLine('Success! ✅')
      // oxlint-disable-next-line socket/no-status-emoji -- test asserts on emoji passthrough in output.
      expect(getContext().writeSpy).toHaveBeenCalledWith('Success! ✅\n')
    })

    it('should not return a value', () => {
      const result = writeLine('test')
      expect(result).toBeUndefined()
    })
  })

  describe('write', () => {
    it('should export write function', () => {
      expect(typeof write).toBe('function')
    })

    it('should write text without newline', () => {
      write('Loading…')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Loading…')
    })

    it('should write empty string', () => {
      write('')
      expect(getContext().writeSpy).toHaveBeenCalledWith('')
    })

    it('should handle ANSI escape sequences', () => {
      write('\u001B[32mGreen\u001B[0m')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        '\u001B[32mGreen\u001B[0m',
      )
    })

    it('should not return a value', () => {
      const result = write('test')
      expect(result).toBeUndefined()
    })
  })

  describe('clearLine', () => {
    it('should export clearLine function', () => {
      expect(typeof clearLine).toBe('function')
    })

    it('should clear line in TTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearLine()
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(0)
      expect(getContext().clearLineSpy).toHaveBeenCalledWith(0)
    })

    it('should not return a value', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = clearLine()
      expect(result).toBeUndefined()
    })
  })

  describe('cursorTo', () => {
    it('should export cursorTo function', () => {
      expect(typeof cursorTo).toBe('function')
    })

    it('should move cursor to x position in TTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(10)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(10, undefined)
    })

    it('should move cursor to x,y position in TTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(10, 5)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(10, 5)
    })

    it('should move cursor to 0,0', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(0, 0)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(0, 0)
    })

    it('should not return a value', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = cursorTo(0)
      expect(result).toBeUndefined()
    })

    it('should handle large coordinates', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(1000, 500)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(1000, 500)
    })

    it('should handle negative coordinates', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(-1, -1)
      expect(getContext().cursorToSpy).toHaveBeenCalledWith(-1, -1)
    })
  })

  describe('clearScreenDown', () => {
    it('should export clearScreenDown function', () => {
      expect(typeof clearScreenDown).toBe('function')
    })

    it('should clear screen down in TTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearScreenDown()
      expect(getContext().clearScreenDownSpy).toHaveBeenCalled()
    })

    it('should not return a value', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = clearScreenDown()
      expect(result).toBeUndefined()
    })
  })

  describe('isTTY', () => {
    it('should export isTTY function', () => {
      expect(typeof isTTY).toBe('function')
    })

    it('should return true when stdout is TTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      expect(isTTY()).toBe(true)
    })

    it('should return false when stdout is not TTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: false,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
    })

    it('should return false when isTTY is undefined', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: undefined,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
    })

    it('should be a boolean', () => {
      expect(typeof isTTY()).toBe('boolean')
    })
  })

  describe('getColumns', () => {
    it('should export getColumns function', () => {
      expect(typeof getColumns).toBe('function')
    })

    it('should return actual columns when set', () => {
      Object.defineProperty(stdout, 'columns', {
        value: 120,
        configurable: true,
      })
      expect(getColumns()).toBe(120)
    })

    it('should return default 80 when columns is undefined', () => {
      Object.defineProperty(stdout, 'columns', {
        value: undefined,
        configurable: true,
      })
      expect(getColumns()).toBe(80)
    })

    it('should return default 80 when columns is 0', () => {
      Object.defineProperty(stdout, 'columns', { value: 0, configurable: true })
      expect(getColumns()).toBe(80)
    })

    it('should handle small terminal width', () => {
      Object.defineProperty(stdout, 'columns', {
        value: 40,
        configurable: true,
      })
      expect(getColumns()).toBe(40)
    })

    it('should handle large terminal width', () => {
      Object.defineProperty(stdout, 'columns', {
        value: 300,
        configurable: true,
      })
      expect(getColumns()).toBe(300)
    })

    it('should be a number', () => {
      expect(typeof getColumns()).toBe('number')
    })
  })

  describe('getRows', () => {
    it('should export getRows function', () => {
      expect(typeof getRows).toBe('function')
    })

    it('should return actual rows when set', () => {
      Object.defineProperty(stdout, 'rows', { value: 50, configurable: true })
      expect(getRows()).toBe(50)
    })

    it('should return default 24 when rows is undefined', () => {
      Object.defineProperty(stdout, 'rows', {
        value: undefined,
        configurable: true,
      })
      expect(getRows()).toBe(24)
    })

    it('should return default 24 when rows is 0', () => {
      Object.defineProperty(stdout, 'rows', { value: 0, configurable: true })
      expect(getRows()).toBe(24)
    })

    it('should handle small terminal height', () => {
      Object.defineProperty(stdout, 'rows', { value: 10, configurable: true })
      expect(getRows()).toBe(10)
    })

    it('should handle large terminal height', () => {
      Object.defineProperty(stdout, 'rows', { value: 100, configurable: true })
      expect(getRows()).toBe(100)
    })

    it('should be a number', () => {
      expect(typeof getRows()).toBe('number')
    })
  })
})
