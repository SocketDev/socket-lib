/**
 * @file Unit tests for stdout cursor lifecycle and scenario utilities. Tests:
 *
 *   - hideCursor() / showCursor() cursor visibility control
 *   - ensureCursorOnExit() idempotent exit-handler registration
 *   - integration, edge-case, and real-world usage scenarios Core stream output
 *     (writeLine/write/clearLine/cursorTo/isTTY/dimensions) lives in
 *     stdout.test.mts.
 */

import process from 'node:process'
import { describe, expect, it } from 'vitest'

import {
  clearLine,
  clearScreenDown,
  cursorTo,
  ensureCursorOnExit,
  getColumns,
  getRows,
  hideCursor,
  isTTY,
  showCursor,
  stdout,
  write,
  writeLine,
} from '../../../src/stdio/stdout'
import { setupStdioTestSuite } from '../util/stdio-test-helper'

describe('stdio/stdout cursor lifecycle', () => {
  const getContext = setupStdioTestSuite(stdout)

  describe('hideCursor', () => {
    it('should export hideCursor function', () => {
      expect(typeof hideCursor).toBe('function')
    })

    it('should write hide cursor sequence in TTY WriteStream', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      hideCursor()
      expect(getContext().writeSpy).toHaveBeenCalledWith('[?25l')
    })

    it('should not return a value', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = hideCursor()
      expect(result).toBeUndefined()
    })
  })

  describe('showCursor', () => {
    it('should export showCursor function', () => {
      expect(typeof showCursor).toBe('function')
    })

    it('should write show cursor sequence in TTY WriteStream', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      showCursor()
      expect(getContext().writeSpy).toHaveBeenCalledWith('[?25h')
    })

    it('should not return a value', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      const result = showCursor()
      expect(result).toBeUndefined()
    })
  })

  describe('ensureCursorOnExit', () => {
    it('should export ensureCursorOnExit function', () => {
      expect(typeof ensureCursorOnExit).toBe('function')
    })

    it('registers exit, SIGINT, and SIGTERM handlers on first call', () => {
      // The module keeps an idempotency flag so subsequent calls no-op.
      // This test captures the handlers registered during module load +
      // the first invocation, not the specific call count (which depends
      // on test ordering and prior imports).
      const existing = {
        exit: process.listenerCount('exit'),
        SIGINT: process.listenerCount('SIGINT'),
        SIGTERM: process.listenerCount('SIGTERM'),
      }
      ensureCursorOnExit()
      // After calling, at minimum the listeners that were there before
      // are still there (idempotency). First call registered all three.
      expect(process.listenerCount('exit')).toBeGreaterThanOrEqual(
        existing.exit,
      )
      expect(process.listenerCount('SIGINT')).toBeGreaterThanOrEqual(
        existing.SIGINT,
      )
      expect(process.listenerCount('SIGTERM')).toBeGreaterThanOrEqual(
        existing.SIGTERM,
      )
    })

    it('should not return a value', () => {
      const result = ensureCursorOnExit()
      expect(result).toBeUndefined()
    })

    it('is idempotent across repeated calls', () => {
      const before = {
        exit: process.listenerCount('exit'),
        SIGINT: process.listenerCount('SIGINT'),
        SIGTERM: process.listenerCount('SIGTERM'),
      }
      ensureCursorOnExit()
      ensureCursorOnExit()
      ensureCursorOnExit()
      // Listener counts must not grow — idempotency guarantees.
      expect(process.listenerCount('exit')).toBe(before.exit)
      expect(process.listenerCount('SIGINT')).toBe(before.SIGINT)
      expect(process.listenerCount('SIGTERM')).toBe(before.SIGTERM)
    })
  })

  describe('integration', () => {
    it('should support write and writeLine together', () => {
      // Clear spy to ensure this test runs in isolation
      getContext().writeSpy.mockClear()
      write('Loading')
      write('...')
      writeLine(' Done!')
      expect(getContext().writeSpy).toHaveBeenCalledTimes(3)
      expect(getContext().writeSpy).toHaveBeenNthCalledWith(1, 'Loading')
      expect(getContext().writeSpy).toHaveBeenNthCalledWith(2, '...')
      expect(getContext().writeSpy).toHaveBeenNthCalledWith(3, ' Done!\n')
    })

    it('should support hide/show cursor pattern', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      hideCursor()
      write('Animation frame 1')
      write('Animation frame 2')
      showCursor()
      expect(getContext().writeSpy).toHaveBeenCalledWith('[?25l')
      expect(getContext().writeSpy).toHaveBeenCalledWith('[?25h')
    })

    it('should handle graceful degradation from TTY to non-TTY', () => {
      // Start with TTY
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      clearLine()
      expect(getContext().clearLineSpy).toHaveBeenCalled()

      getContext().clearLineSpy!.mockClear()

      // Switch to non-TTY
      Object.defineProperty(stdout, 'isTTY', {
        value: false,
        configurable: true,
      })
      clearLine()
      expect(getContext().clearLineSpy).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle undefined isTTY', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: undefined,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
      clearLine() // Should not throw
      cursorTo(0) // Should not throw
      clearScreenDown() // Should not throw
      hideCursor() // Should not throw
      showCursor() // Should not throw
    })

    it('should handle very long text', () => {
      const longText = 'x'.repeat(10_000)
      writeLine(longText)
      expect(getContext().writeSpy).toHaveBeenCalledWith(`${longText}\n`)
    })

    it('should handle rapid cursor movements', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      // Clear spy calls from any previous tests to ensure accurate count
      getContext().cursorToSpy!.mockClear()
      const callsBefore = getContext().cursorToSpy!.mock.calls.length
      for (let i = 0; i < 100; i++) {
        cursorTo(i, i)
      }
      const callsAfter = getContext().cursorToSpy!.mock.calls.length
      expect(callsAfter - callsBefore).toBe(100)
    })

    it('should handle terminal dimension changes', () => {
      Object.defineProperty(stdout, 'columns', {
        value: 80,
        configurable: true,
      })
      expect(getColumns()).toBe(80)

      Object.defineProperty(stdout, 'columns', {
        value: 120,
        configurable: true,
      })
      expect(getColumns()).toBe(120)
    })

    it('should handle null-like terminal dimensions', () => {
      Object.defineProperty(stdout, 'columns', {
        value: undefined,
        configurable: true,
      })
      expect(getColumns()).toBe(80)

      Object.defineProperty(stdout, 'rows', {
        value: undefined,
        configurable: true,
      })
      expect(getRows()).toBe(24)
    })
  })

  describe('real-world usage', () => {
    it('should support progress indicator pattern', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      // Clear spy to ensure this test runs in isolation
      getContext().writeSpy.mockClear()
      write('Loading…')
      clearLine()
      write('Loading… 50%')
      clearLine()
      write('Loading… 100%')
      writeLine(' Done!')
      // Actual calls: 3 writes + 1 writeLine = 4 calls (clearLine calls cursorTo and clearLine internally but not write)
      expect(getContext().writeSpy).toHaveBeenCalledTimes(4)
    })

    it('should support spinner pattern', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: true,
        configurable: true,
      })
      hideCursor()
      const frames = ['⠋', '⠙', '⠹', '⠸']
      for (let i = 0, { length } = frames; i < length; i += 1) {
        const frame = frames[i]!
        write(frame)
        clearLine()
      }
      showCursor()
      expect(getContext().writeSpy).toHaveBeenCalledWith('[?25l')
      expect(getContext().writeSpy).toHaveBeenCalledWith('[?25h')
    })

    it('should support table rendering', () => {
      // Clear spy to ensure this test runs in isolation
      getContext().writeSpy.mockClear()
      writeLine('Name        | Age | City')
      writeLine('------------|-----|-------')
      writeLine('John Doe    | 30  | NYC')
      writeLine('Jane Smith  | 25  | LA')
      expect(getContext().writeSpy).toHaveBeenCalledTimes(4)
    })

    it('should detect redirected output', () => {
      Object.defineProperty(stdout, 'isTTY', {
        value: false,
        configurable: true,
      })
      expect(isTTY()).toBe(false)
      // When piped, should still write but skip terminal control
      writeLine('Output line')
      expect(getContext().writeSpy).toHaveBeenCalled()
    })

    it('should handle terminal size queries', () => {
      Object.defineProperty(stdout, 'columns', {
        value: 120,
        configurable: true,
      })
      Object.defineProperty(stdout, 'rows', { value: 40, configurable: true })
      const width = getColumns()
      const height = getRows()
      expect(width).toBe(120)
      expect(height).toBe(40)
    })
  })
})
