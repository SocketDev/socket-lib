/**
 * @file Unit tests for terminal line and screen clearing utilities. Tests
 *   terminal control utilities:
 *
 *   - clearScreen() / clearVisible() clear the terminal display
 *   - clearLine() / clearLines() clear current and prior lines
 *   - cursorToStart() repositions the cursor to column zero
 *   - ANSI escape sequences for terminal control Used by Socket CLI for
 *     interactive output, spinners, and progress indicators. Cursor visibility
 *     and save/restore tests live in clear.cursor.test.mts.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  clearLine,
  clearLines,
  clearScreen,
  clearVisible,
  cursorToStart,
} from '../../../src/stdio/clear'

describe('stdio/clear', () => {
  describe('clearLine', () => {
    it('should use TTY methods when stream is TTY', () => {
      const mockStream = {
        isTTY: true,
        cursorTo: vi.fn(),
        clearLine: vi.fn(),
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLine(mockStream)

      expect(mockStream.cursorTo).toHaveBeenCalledWith(0)
      expect(mockStream.clearLine).toHaveBeenCalledWith(0)
      expect(mockStream.write).not.toHaveBeenCalled()
    })

    it('should use ANSI escape codes when stream is not TTY', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLine(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\r\x1b[K')
    })

    it('should default to process.stdout', () => {
      // Just verify it doesn't throw
      expect(() => clearLine()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLine(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should write correct ANSI sequence for non-TTY', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLine(mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toContain('\r') // Carriage return
      expect(written).toContain('\x1b[K') // Clear to end of line
    })

    it('should handle TTY with cursorTo and clearLine methods', () => {
      const cursorTo = vi.fn()
      const clearLineMethod = vi.fn()

      const mockStream = {
        isTTY: true,
        cursorTo,
        clearLine: clearLineMethod,
      } as unknown as NodeJS.WriteStream

      clearLine(mockStream)

      expect(cursorTo).toHaveBeenCalledWith(0)
      expect(clearLineMethod).toHaveBeenCalledWith(0)
    })
  })

  describe('clearLines', () => {
    it('should clear multiple lines', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(3, mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(3)
    })

    it('should write correct ANSI sequence for each line', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(2, mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b[1A\x1b[2K')
      expect(mockStream.write).toHaveBeenCalledTimes(2)
    })

    it('should handle zero lines', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(0, mockStream)

      expect(mockStream.write).not.toHaveBeenCalled()
    })

    it('should handle one line', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(1, mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should default to process.stdout', () => {
      expect(() => clearLines(1)).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(5, mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(5)
    })

    it('should move up one line for each clear', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(1, mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toContain('\x1b[1A') // Move up one line
      expect(written).toContain('\x1b[2K') // Erase entire line
    })

    it('should handle large number of lines', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(100, mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(100)
    })
  })

  describe('clearScreen', () => {
    it('should clear screen when stream is TTY', () => {
      const mockStream = {
        isTTY: true,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearScreen(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1bc')
    })

    it('should not write when stream is not TTY', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearScreen(mockStream)

      expect(mockStream.write).not.toHaveBeenCalled()
    })

    it('should default to process.stdout', () => {
      expect(() => clearScreen()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        isTTY: true,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearScreen(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should use full reset ANSI sequence', () => {
      const mockStream = {
        isTTY: true,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearScreen(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1bc')
    })

    it('should handle non-TTY gracefully', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      expect(() => clearScreen(mockStream)).not.toThrow()
      expect(mockStream.write).not.toHaveBeenCalled()
    })
  })

  describe('clearVisible', () => {
    it('should call clearScreen', () => {
      const mockStream = {
        isTTY: true,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearVisible(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1bc')
    })

    it('should default to process.stdout', () => {
      expect(() => clearVisible()).not.toThrow()
    })

    it('should behave like clearScreen for TTY', () => {
      const mockStream = {
        isTTY: true,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearVisible(mockStream)
      clearScreen(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(2)
      expect(mockStream.write).toHaveBeenNthCalledWith(1, '\x1bc')
      expect(mockStream.write).toHaveBeenNthCalledWith(2, '\x1bc')
    })

    it('should behave like clearScreen for non-TTY', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearVisible(mockStream)

      expect(mockStream.write).not.toHaveBeenCalled()
    })
  })

  describe('cursorToStart', () => {
    it('should use cursorTo method when stream is TTY', () => {
      const mockStream = {
        isTTY: true,
        cursorTo: vi.fn(),
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      cursorToStart(mockStream)

      expect(mockStream.cursorTo).toHaveBeenCalledWith(0)
      expect(mockStream.write).not.toHaveBeenCalled()
    })

    it('should use carriage return when stream is not TTY', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      cursorToStart(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\r')
    })

    it('should default to process.stdout', () => {
      expect(() => cursorToStart()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      cursorToStart(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should write carriage return for non-TTY', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      cursorToStart(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\r')
    })
  })

  describe('integration scenarios', () => {
    it('should support clearing multiple lines', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(3, mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(3)
      for (let i = 0; i < 3; i++) {
        expect(mockStream.write).toHaveBeenNthCalledWith(
          i + 1,
          '\x1b[1A\x1b[2K',
        )
      }
    })
  })

  describe('ANSI sequences', () => {
    it('should use correct escape codes for cursor movement', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearLines(1, mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toContain('\x1b[1A') // Up one line
      expect(written).toContain('\x1b[2K') // Clear line
    })

    it('should use correct escape codes for screen clear', () => {
      const mockStream = {
        isTTY: true,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      clearScreen(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1bc')
    })
  })

  describe('error handling', () => {
    it('should handle TTY detection gracefully', () => {
      const ttyStream = {
        isTTY: true,
        cursorTo: vi.fn(),
        clearLine: vi.fn(),
      } as unknown as NodeJS.WriteStream

      const nonTtyStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      expect(() => clearLine(ttyStream)).not.toThrow()
      expect(() => clearLine(nonTtyStream)).not.toThrow()
    })

    it('should handle missing isTTY property', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      expect(() => clearScreen(mockStream)).not.toThrow()
    })
  })

  describe('real-world usage', () => {
    it('should support progress bar clearing', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      // Typical progress bar pattern
      clearLine(mockStream)
      cursorToStart(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\r\x1b[K')
      expect(mockStream.write).toHaveBeenCalledWith('\r')
    })

    it('should support multi-line status clearing', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      // Clear 3 lines of status
      clearLines(3, mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(3)
    })
  })

  describe('stream parameter defaults', () => {
    it('should default all functions to process.stdout', () => {
      expect(() => clearLine()).not.toThrow()
      expect(() => clearLines(1)).not.toThrow()
      expect(() => clearScreen()).not.toThrow()
      expect(() => clearVisible()).not.toThrow()
      expect(() => cursorToStart()).not.toThrow()
    })
  })
})
