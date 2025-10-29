/**
 * @fileoverview Unit tests for stderr stream utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearLine,
  cursorTo,
  getColumns,
  getRows,
  isTTY,
  stderr,
  writeError,
  writeErrorFormatted,
  writeErrorLine,
  writeStackTrace,
  writeWarning,
} from '@socketsecurity/lib/stdio/stderr'

describe('stdio/stderr', () => {
  let originalIsTTY: boolean | undefined
  let originalColumns: number | undefined
  let originalRows: number | undefined
  let writeSpy: ReturnType<typeof vi.spyOn>
  let cursorToSpy: ReturnType<typeof vi.spyOn>
  let clearLineSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Save original properties
    originalIsTTY = stderr.isTTY
    originalColumns = stderr.columns
    originalRows = stderr.rows

    // Add TTY methods if they don't exist (for non-TTY environments)
    if (!stderr.cursorTo) {
      ;(stderr as any).cursorTo = () => {}
    }
    if (!stderr.clearLine) {
      ;(stderr as any).clearLine = () => {}
    }

    // Create spies
    // @ts-expect-error - Vitest spy type doesn't match ReturnType<typeof vi.spyOn>
    writeSpy = vi.spyOn(stderr, 'write').mockImplementation(() => true)
    // @ts-expect-error - Vitest spy type doesn't match ReturnType<typeof vi.spyOn>
    cursorToSpy = vi.spyOn(stderr, 'cursorTo').mockImplementation(() => {})
    // @ts-expect-error - Vitest spy type doesn't match ReturnType<typeof vi.spyOn>
    clearLineSpy = vi.spyOn(stderr, 'clearLine').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore spies
    writeSpy?.mockRestore()
    cursorToSpy?.mockRestore()
    clearLineSpy?.mockRestore()

    // Restore original properties
    Object.defineProperty(stderr, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    })
    Object.defineProperty(stderr, 'columns', {
      value: originalColumns,
      configurable: true,
    })
    Object.defineProperty(stderr, 'rows', {
      value: originalRows,
      configurable: true,
    })
  })

  describe('stderr', () => {
    it('should export stderr stream', () => {
      expect(stderr).toBeDefined()
      expect(stderr).toBe(process.stderr)
    })

    it('should be a WriteStream', () => {
      expect(stderr).toBeInstanceOf(Object)
    })
  })

  describe('writeErrorLine', () => {
    it('should export writeErrorLine function', () => {
      expect(typeof writeErrorLine).toBe('function')
    })

    it('should write text with newline', () => {
      writeErrorLine('Error occurred')
      expect(writeSpy).toHaveBeenCalledWith('Error occurred\n')
    })

    it('should write empty line when no text provided', () => {
      writeErrorLine()
      expect(writeSpy).toHaveBeenCalledWith('\n')
    })

    it('should write empty string with newline', () => {
      writeErrorLine('')
      expect(writeSpy).toHaveBeenCalledWith('\n')
    })

    it('should handle multiline text', () => {
      writeErrorLine('Line 1\nLine 2')
      expect(writeSpy).toHaveBeenCalledWith('Line 1\nLine 2\n')
    })

    it('should handle special characters', () => {
      writeErrorLine('Tab\tNewline')
      expect(writeSpy).toHaveBeenCalledWith('Tab\tNewline\n')
    })

    it('should handle Unicode characters', () => {
      writeErrorLine('Error: 失败')
      expect(writeSpy).toHaveBeenCalledWith('Error: 失败\n')
    })

    it('should handle ANSI color codes', () => {
      writeErrorLine('\u001B[31mRed Error\u001B[0m')
      expect(writeSpy).toHaveBeenCalledWith('\u001B[31mRed Error\u001B[0m\n')
    })

    it('should not return a value', () => {
      const result = writeErrorLine('test')
      expect(result).toBeUndefined()
    })
  })

  describe('writeError', () => {
    it('should export writeError function', () => {
      expect(typeof writeError).toBe('function')
    })

    it('should write text without newline', () => {
      writeError('Downloading...')
      expect(writeSpy).toHaveBeenCalledWith('Downloading...')
    })

    it('should write empty string', () => {
      writeError('')
      expect(writeSpy).toHaveBeenCalledWith('')
    })

    it('should handle multiple writes', () => {
      writeError('Part 1')
      writeError(' Part 2')
      expect(writeSpy).toHaveBeenCalledTimes(2)
      expect(writeSpy).toHaveBeenNthCalledWith(1, 'Part 1')
      expect(writeSpy).toHaveBeenNthCalledWith(2, ' Part 2')
    })

    it('should not add newline', () => {
      writeError('test')
      expect(writeSpy).toHaveBeenCalledWith('test')
      expect(writeSpy).not.toHaveBeenCalledWith('test\n')
    })

    it('should handle ANSI escape sequences', () => {
      writeError('\u001B[33mWarning\u001B[0m')
      expect(writeSpy).toHaveBeenCalledWith('\u001B[33mWarning\u001B[0m')
    })

    it('should not return a value', () => {
      const result = writeError('test')
      expect(result).toBeUndefined()
    })
  })

  describe('clearLine', () => {
    it('should export clearLine function', () => {
      expect(typeof clearLine).toBe('function')
    })

    it('should clear line in TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearLine()
      expect(cursorToSpy).toHaveBeenCalledWith(0)
      expect(clearLineSpy).toHaveBeenCalledWith(0)
    })

    it('should not clear line when not TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      clearLine()
      expect(cursorToSpy).not.toHaveBeenCalled()
      expect(clearLineSpy).not.toHaveBeenCalled()
    })

    it('should not return a value', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = clearLine()
      expect(result).toBeUndefined()
    })

    it('should move cursor to start of line before clearing', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearLine()
      // @ts-expect-error - Vitest toHaveBeenCalledBefore matcher not recognized by TypeScript
      expect(cursorToSpy).toHaveBeenCalledBefore(clearLineSpy)
    })
  })

  describe('cursorTo', () => {
    it('should export cursorTo function', () => {
      expect(typeof cursorTo).toBe('function')
    })

    it('should move cursor to x position in TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(10)
      expect(cursorToSpy).toHaveBeenCalledWith(10, undefined)
    })

    it('should move cursor to x,y position in TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(10, 5)
      expect(cursorToSpy).toHaveBeenCalledWith(10, 5)
    })

    it('should move cursor to 0,0', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(0, 0)
      expect(cursorToSpy).toHaveBeenCalledWith(0, 0)
    })

    it('should not move cursor when not TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      cursorTo(10, 5)
      expect(cursorToSpy).not.toHaveBeenCalled()
    })

    it('should not return a value', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = cursorTo(0)
      expect(result).toBeUndefined()
    })

    it('should handle large coordinates', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(1000, 500)
      expect(cursorToSpy).toHaveBeenCalledWith(1000, 500)
    })

    it('should handle negative coordinates', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      cursorTo(-1, -1)
      expect(cursorToSpy).toHaveBeenCalledWith(-1, -1)
    })
  })

  describe('isTTY', () => {
    it('should export isTTY function', () => {
      expect(typeof isTTY).toBe('function')
    })

    it('should return true when stderr is TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      expect(isTTY()).toBe(true)
    })

    it('should return false when stderr is not TTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
    })

    it('should return false when isTTY is undefined', () => {
      Object.defineProperty(stderr, 'isTTY', {
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
      Object.defineProperty(stderr, 'columns', {
        value: 120,
        configurable: true,
      })
      expect(getColumns()).toBe(120)
    })

    it('should return default 80 when columns is undefined', () => {
      Object.defineProperty(stderr, 'columns', {
        value: undefined,
        configurable: true,
      })
      expect(getColumns()).toBe(80)
    })

    it('should return default 80 when columns is 0', () => {
      Object.defineProperty(stderr, 'columns', { value: 0, configurable: true })
      expect(getColumns()).toBe(80)
    })

    it('should handle small terminal width', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 40,
        configurable: true,
      })
      expect(getColumns()).toBe(40)
    })

    it('should handle large terminal width', () => {
      Object.defineProperty(stderr, 'columns', {
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
      Object.defineProperty(stderr, 'rows', { value: 50, configurable: true })
      expect(getRows()).toBe(50)
    })

    it('should return default 24 when rows is undefined', () => {
      Object.defineProperty(stderr, 'rows', {
        value: undefined,
        configurable: true,
      })
      expect(getRows()).toBe(24)
    })

    it('should return default 24 when rows is 0', () => {
      Object.defineProperty(stderr, 'rows', { value: 0, configurable: true })
      expect(getRows()).toBe(24)
    })

    it('should handle small terminal height', () => {
      Object.defineProperty(stderr, 'rows', { value: 10, configurable: true })
      expect(getRows()).toBe(10)
    })

    it('should handle large terminal height', () => {
      Object.defineProperty(stderr, 'rows', { value: 100, configurable: true })
      expect(getRows()).toBe(100)
    })

    it('should be a number', () => {
      expect(typeof getRows()).toBe('number')
    })
  })

  describe('writeWarning', () => {
    it('should export writeWarning function', () => {
      expect(typeof writeWarning).toBe('function')
    })

    it('should write warning with default prefix', () => {
      writeWarning('Deprecated API')
      expect(writeSpy).toHaveBeenCalledWith('Warning: Deprecated API\n')
    })

    it('should write warning with custom prefix', () => {
      writeWarning('Invalid config', 'Config')
      expect(writeSpy).toHaveBeenCalledWith('Config: Invalid config\n')
    })

    it('should handle empty message', () => {
      writeWarning('')
      expect(writeSpy).toHaveBeenCalledWith('Warning: \n')
    })

    it('should handle multiline message', () => {
      writeWarning('Line 1\nLine 2')
      expect(writeSpy).toHaveBeenCalledWith('Warning: Line 1\nLine 2\n')
    })

    it('should handle special characters in message', () => {
      writeWarning('Path contains \\n escape')
      expect(writeSpy).toHaveBeenCalledWith(
        'Warning: Path contains \\n escape\n',
      )
    })

    it('should handle Unicode in message', () => {
      writeWarning('警告メッセージ')
      expect(writeSpy).toHaveBeenCalledWith('Warning: 警告メッセージ\n')
    })

    it('should handle empty prefix', () => {
      writeWarning('Test message', '')
      expect(writeSpy).toHaveBeenCalledWith(': Test message\n')
    })

    it('should not return a value', () => {
      const result = writeWarning('test')
      expect(result).toBeUndefined()
    })
  })

  describe('writeErrorFormatted', () => {
    it('should export writeErrorFormatted function', () => {
      expect(typeof writeErrorFormatted).toBe('function')
    })

    it('should write error with default prefix', () => {
      writeErrorFormatted('File not found')
      expect(writeSpy).toHaveBeenCalledWith('Error: File not found\n')
    })

    it('should write error with custom prefix', () => {
      writeErrorFormatted('Connection failed', 'Network')
      expect(writeSpy).toHaveBeenCalledWith('Network: Connection failed\n')
    })

    it('should handle empty message', () => {
      writeErrorFormatted('')
      expect(writeSpy).toHaveBeenCalledWith('Error: \n')
    })

    it('should handle multiline message', () => {
      writeErrorFormatted('Line 1\nLine 2')
      expect(writeSpy).toHaveBeenCalledWith('Error: Line 1\nLine 2\n')
    })

    it('should handle special characters', () => {
      writeErrorFormatted('Invalid character: $')
      expect(writeSpy).toHaveBeenCalledWith('Error: Invalid character: $\n')
    })

    it('should handle Unicode characters', () => {
      writeErrorFormatted('エラーが発生しました')
      expect(writeSpy).toHaveBeenCalledWith('Error: エラーが発生しました\n')
    })

    it('should handle empty prefix', () => {
      writeErrorFormatted('Test message', '')
      expect(writeSpy).toHaveBeenCalledWith(': Test message\n')
    })

    it('should not return a value', () => {
      const result = writeErrorFormatted('test')
      expect(result).toBeUndefined()
    })
  })

  describe('writeStackTrace', () => {
    it('should export writeStackTrace function', () => {
      expect(typeof writeStackTrace).toBe('function')
    })

    it('should write error stack when available', () => {
      const error = new Error('Test error')
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalled()
      const callArg = writeSpy.mock.calls[0][0] as string
      expect(callArg).toContain('Error: Test error')
      expect(callArg).toContain('\n')
    })

    it('should write formatted error when no stack', () => {
      const error = new Error('Test error')
      error.stack = undefined
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalledWith('Error: Test error\n')
    })

    it('should handle error with custom name', () => {
      const error = new TypeError('Type mismatch')
      writeStackTrace(error)
      const callArg = writeSpy.mock.calls[0][0] as string
      expect(callArg).toContain('TypeError')
      expect(callArg).toContain('Type mismatch')
    })

    it('should handle error with empty message', () => {
      const error = new Error('')
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalled()
    })

    it('should handle error with multiline message', () => {
      const error = new Error('Line 1\nLine 2')
      error.stack = undefined
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalledWith('Error: Line 1\nLine 2\n')
    })

    it('should handle error with Unicode message', () => {
      const error = new Error('エラー: 失敗')
      error.stack = undefined
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalledWith('Error: エラー: 失敗\n')
    })

    it('should not return a value', () => {
      const error = new Error('test')
      const result = writeStackTrace(error)
      expect(result).toBeUndefined()
    })
  })

  describe('integration', () => {
    it('should support error reporting pattern', () => {
      writeWarning('Deprecation notice')
      writeErrorFormatted('Operation failed')
      expect(writeSpy).toHaveBeenCalledTimes(2)
      expect(writeSpy).toHaveBeenNthCalledWith(
        1,
        'Warning: Deprecation notice\n',
      )
      expect(writeSpy).toHaveBeenNthCalledWith(2, 'Error: Operation failed\n')
    })

    it('should support progress error messages', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      writeError('Processing...')
      clearLine()
      writeError('Failed!')
      expect(writeSpy).toHaveBeenCalledTimes(2)
      expect(cursorToSpy).toHaveBeenCalledWith(0)
      expect(clearLineSpy).toHaveBeenCalledWith(0)
    })

    it('should support exception handling pattern', () => {
      try {
        throw new Error('Something went wrong')
      } catch (err) {
        writeStackTrace(err as Error)
      }
      expect(writeSpy).toHaveBeenCalled()
    })

    it('should support different error types', () => {
      writeWarning('Potential issue', 'Warning')
      writeErrorFormatted('Critical failure', 'Fatal')
      const error = new Error('Stack trace')
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalledTimes(3)
    })

    it('should handle graceful degradation from TTY to non-TTY', () => {
      // Start with TTY
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearLine()
      expect(clearLineSpy).toHaveBeenCalled()

      clearLineSpy.mockClear()

      // Switch to non-TTY
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      clearLine()
      expect(clearLineSpy).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle undefined isTTY', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: undefined,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
      clearLine() // Should not throw
      cursorTo(0) // Should not throw
    })

    it('should handle very long error messages', () => {
      const longMessage = 'x'.repeat(10_000)
      writeErrorLine(longMessage)
      expect(writeSpy).toHaveBeenCalledWith(`${longMessage}\n`)
    })

    it('should handle empty writes', () => {
      writeError('')
      writeErrorLine('')
      expect(writeSpy).toHaveBeenCalledTimes(2)
    })

    it('should handle rapid cursor movements', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      for (let i = 0; i < 100; i++) {
        cursorTo(i, i)
      }
      expect(cursorToSpy).toHaveBeenCalledTimes(100)
    })

    it('should handle terminal dimension changes', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 80,
        configurable: true,
      })
      expect(getColumns()).toBe(80)

      Object.defineProperty(stderr, 'columns', {
        value: 120,
        configurable: true,
      })
      expect(getColumns()).toBe(120)
    })

    it('should handle null-like terminal dimensions', () => {
      Object.defineProperty(stderr, 'columns', {
        value: null,
        configurable: true,
      })
      expect(getColumns()).toBe(80)

      Object.defineProperty(stderr, 'rows', { value: null, configurable: true })
      expect(getRows()).toBe(24)
    })

    it('should handle errors with no stack property', () => {
      const error = { message: 'Not a real Error' } as Error
      writeStackTrace(error)
      expect(writeSpy).toHaveBeenCalledWith('Error: Not a real Error\n')
    })
  })

  describe('real-world usage', () => {
    it('should support CLI error reporting', () => {
      writeErrorFormatted('Command not found: foo', 'CLI')
      writeWarning('Using deprecated flag --old')
      expect(writeSpy).toHaveBeenCalledTimes(2)
    })

    it('should support validation error messages', () => {
      writeErrorFormatted('Invalid email format', 'Validation')
      writeErrorFormatted('Password too short', 'Validation')
      writeWarning('Username contains special characters', 'Validation')
      expect(writeSpy).toHaveBeenCalledTimes(3)
    })

    it('should support exception logging', () => {
      try {
        throw new TypeError('Cannot read property of null')
      } catch (err) {
        writeStackTrace(err as Error)
      }
      const callArg = writeSpy.mock.calls[0][0] as string
      expect(callArg).toContain('TypeError')
      expect(callArg).toContain('Cannot read property of null')
    })

    it('should support status messages', () => {
      writeErrorLine('✗ Build failed')
      writeErrorLine('✗ Tests failed')
      writeWarning('Code coverage below threshold')
      expect(writeSpy).toHaveBeenCalledTimes(3)
    })

    it('should detect redirected error output', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
      // When piped, should still write but skip terminal control
      writeErrorLine('Error line')
      expect(writeSpy).toHaveBeenCalled()
    })

    it('should handle terminal size queries', () => {
      Object.defineProperty(stderr, 'columns', {
        value: 120,
        configurable: true,
      })
      Object.defineProperty(stderr, 'rows', { value: 40, configurable: true })
      const width = getColumns()
      const height = getRows()
      expect(width).toBe(120)
      expect(height).toBe(40)
    })

    it('should support build tool error patterns', () => {
      writeErrorFormatted('Compilation failed', 'TypeScript')
      writeErrorLine('  Type error in src/index.ts:10:5')
      writeWarning('Unused variable detected')
      expect(writeSpy).toHaveBeenCalledTimes(3)
    })
  })
})
