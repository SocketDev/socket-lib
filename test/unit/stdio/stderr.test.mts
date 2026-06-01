/**
 * @file Unit tests for stderr stream writer utilities. Tests stderr output:
 *
 *   - writeStderr() writes to stderr stream
 *   - Error message formatting
 *   - Warning and stack-trace formatting Used by Socket tools for error
 *     reporting and diagnostic output. Terminal/stream-control coverage
 *     (TTY detection, cursor, dimensions) lives in stderr-terminal.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  clearLine,
  stderr,
  writeError,
  writeErrorFormatted,
  writeErrorLine,
  writeStackTrace,
  writeWarning,
} from '../../../src/stdio/stderr'
import { setupStdioTestSuite } from '../util/stdio-test-helper'

describe('stdio/stderr', () => {
  const getContext = setupStdioTestSuite(stderr)

  describe('writeErrorLine', () => {
    it('should export writeErrorLine function', () => {
      expect(typeof writeErrorLine).toBe('function')
    })

    it('should write text with newline', () => {
      writeErrorLine('Error occurred')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Error occurred\n')
    })

    it('should write empty line when no text provided', () => {
      writeErrorLine()
      expect(getContext().writeSpy).toHaveBeenCalledWith('\n')
    })

    it('should write empty string with newline', () => {
      writeErrorLine('')
      expect(getContext().writeSpy).toHaveBeenCalledWith('\n')
    })

    it('should handle multiline text', () => {
      writeErrorLine('Line 1\nLine 2')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Line 1\nLine 2\n')
    })

    it('should handle special characters', () => {
      writeErrorLine('Tab\tNewline')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Tab\tNewline\n')
    })

    it('should handle Unicode characters', () => {
      writeErrorLine('Error: 失败')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Error: 失败\n')
    })

    it('should handle ANSI color codes', () => {
      writeErrorLine('[31mRed Error[0m')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        '[31mRed Error[0m\n',
      )
    })

    it('should not return a value', () => {
      const result = writeErrorLine('test')
      expect(result).toBeUndefined()
    })

    it('should handle very long error messages', () => {
      const longMessage = 'x'.repeat(10_000)
      writeErrorLine(longMessage)
      expect(getContext().writeSpy).toHaveBeenCalledWith(`${longMessage}\n`)
    })
  })

  describe('writeError', () => {
    it('should export writeError function', () => {
      expect(typeof writeError).toBe('function')
    })

    it('should write text without newline', () => {
      writeError('Downloading…')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Downloading…')
    })

    it('should write empty string', () => {
      writeError('')
      expect(getContext().writeSpy).toHaveBeenCalledWith('')
    })

    it('should handle ANSI escape sequences', () => {
      writeError('[33mWarning[0m')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        '[33mWarning[0m',
      )
    })

    it('should not return a value', () => {
      const result = writeError('test')
      expect(result).toBeUndefined()
    })
  })

  describe('writeWarning', () => {
    it('should export writeWarning function', () => {
      expect(typeof writeWarning).toBe('function')
    })

    it('should write warning with default prefix', () => {
      writeWarning('Deprecated API')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Warning: Deprecated API\n',
      )
    })

    it('should write warning with custom prefix', () => {
      writeWarning('Invalid config', 'Config')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Config: Invalid config\n',
      )
    })

    it('should handle empty message', () => {
      writeWarning('')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Warning: \n')
    })

    it('should handle multiline message', () => {
      writeWarning('Line 1\nLine 2')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Warning: Line 1\nLine 2\n',
      )
    })

    it('should handle special characters in message', () => {
      writeWarning('Path contains \\n escape')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Warning: Path contains \\n escape\n',
      )
    })

    it('should handle Unicode in message', () => {
      writeWarning('警告メッセージ')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Warning: 警告メッセージ\n',
      )
    })

    it('should handle empty prefix', () => {
      writeWarning('Test message', '')
      expect(getContext().writeSpy).toHaveBeenCalledWith(': Test message\n')
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
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: File not found\n',
      )
    })

    it('should write error with custom prefix', () => {
      writeErrorFormatted('Connection failed', 'Network')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Network: Connection failed\n',
      )
    })

    it('should handle empty message', () => {
      writeErrorFormatted('')
      expect(getContext().writeSpy).toHaveBeenCalledWith('Error: \n')
    })

    it('should handle multiline message', () => {
      writeErrorFormatted('Line 1\nLine 2')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: Line 1\nLine 2\n',
      )
    })

    it('should handle special characters', () => {
      writeErrorFormatted('Invalid character: $')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: Invalid character: $\n',
      )
    })

    it('should handle Unicode characters', () => {
      writeErrorFormatted('エラーが発生しました')
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: エラーが発生しました\n',
      )
    })

    it('should handle empty prefix', () => {
      writeErrorFormatted('Test message', '')
      expect(getContext().writeSpy).toHaveBeenCalledWith(': Test message\n')
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

    it('should write formatted error when no stack', () => {
      const error = new Error('Test error')
      delete error.stack
      writeStackTrace(error)
      expect(getContext().writeSpy).toHaveBeenCalledWith('Error: Test error\n')
    })

    it('should handle error with empty message', () => {
      const error = new Error('')
      writeStackTrace(error)
      expect(getContext().writeSpy).toHaveBeenCalled()
    })

    it('should handle error with multiline message', () => {
      const error = new Error('Line 1\nLine 2')
      delete error.stack
      writeStackTrace(error)
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: Line 1\nLine 2\n',
      )
    })

    it('should handle error with Unicode message', () => {
      const error = new Error('エラー: 失敗')
      delete error.stack
      writeStackTrace(error)
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: エラー: 失敗\n',
      )
    })

    it('should handle errors with no stack property', () => {
      const error = { message: 'Not a real Error' } as Error
      writeStackTrace(error)
      expect(getContext().writeSpy).toHaveBeenCalledWith(
        'Error: Not a real Error\n',
      )
    })

    it('should not return a value', () => {
      const error = new Error('test')
      const result = writeStackTrace(error)
      expect(result).toBeUndefined()
    })
  })

  describe('integration', () => {
    it('should support exception handling pattern', () => {
      try {
        throw new Error('Something went wrong')
      } catch (e) {
        writeStackTrace(e as Error)
      }
      expect(getContext().writeSpy).toHaveBeenCalled()
    })

    it('should handle graceful degradation from TTY to non-TTY', () => {
      // Start with TTY
      Object.defineProperty(stderr, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearLine()
      expect(getContext().clearLineSpy).toHaveBeenCalled()

      getContext().clearLineSpy!.mockClear()

      // Switch to non-TTY
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      clearLine()
      expect(getContext().clearLineSpy).not.toHaveBeenCalled()
    })

    it('should write error output when piped', () => {
      Object.defineProperty(stderr, 'isTTY', {
        value: false,
        configurable: true,
      })
      writeErrorLine('Error line')
      expect(getContext().writeSpy).toHaveBeenCalled()
    })
  })
})
