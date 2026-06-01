/**
 * @file Unit tests for terminal cursor visibility and save/restore utilities.
 *   Tests cursor control utilities:
 *
 *   - hideCursor() / showCursor() toggle cursor visibility (DECTCEM)
 *   - saveCursor() / restoreCursor() persist and recall cursor position
 *     (DECSC/DECRC)
 *   - ANSI escape sequences for cursor control Used by Socket CLI for interactive
 *     output, spinners, and progress indicators.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  hideCursor,
  restoreCursor,
  saveCursor,
  showCursor,
} from '../../../src/stdio/clear'

describe('stdio/clear cursor', () => {
  describe('hideCursor', () => {
    it('should write DECTCEM hide cursor sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?25l')
    })

    it('should default to process.stdout', () => {
      expect(() => hideCursor()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should write correct ANSI sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toBe('\x1b[?25l')
    })

    it('should work on any stream', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalled()
    })
  })

  describe('showCursor', () => {
    it('should write DECTCEM show cursor sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      showCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?25h')
    })

    it('should default to process.stdout', () => {
      expect(() => showCursor()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      showCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should write correct ANSI sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      showCursor(mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toBe('\x1b[?25h')
    })

    it('should work on any stream', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      showCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalled()
    })
  })

  describe('saveCursor', () => {
    it('should write DECSC save cursor sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      saveCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b7')
    })

    it('should default to process.stdout', () => {
      expect(() => saveCursor()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      saveCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should write correct ANSI sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      saveCursor(mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toBe('\x1b7')
    })

    it('should work on any stream', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      saveCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalled()
    })
  })

  describe('restoreCursor', () => {
    it('should write DECRC restore cursor sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      restoreCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b8')
    })

    it('should default to process.stdout', () => {
      expect(() => restoreCursor()).not.toThrow()
    })

    it('should support custom stream', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      restoreCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledTimes(1)
    })

    it('should write correct ANSI sequence', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      restoreCursor(mockStream)

      // @ts-expect-error - Vitest mock.mock property not recognized by TypeScript
      const written = mockStream.write.mock.calls[0][0] as string
      expect(written).toBe('\x1b8')
    })

    it('should work on any stream', () => {
      const mockStream = {
        isTTY: false,
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      restoreCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalled()
    })
  })

  describe('cursor workflows', () => {
    it('should support hide/show cursor workflow', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)
      showCursor(mockStream)

      expect(mockStream.write).toHaveBeenNthCalledWith(1, '\x1b[?25l')
      expect(mockStream.write).toHaveBeenNthCalledWith(2, '\x1b[?25h')
    })

    it('should support save/restore cursor workflow', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      saveCursor(mockStream)
      restoreCursor(mockStream)

      expect(mockStream.write).toHaveBeenNthCalledWith(1, '\x1b7')
      expect(mockStream.write).toHaveBeenNthCalledWith(2, '\x1b8')
    })

    it('should use correct escape codes for cursor visibility', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)
      showCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?25l')
      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?25h')
    })

    it('should use correct escape codes for cursor save/restore', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      saveCursor(mockStream)
      restoreCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b7')
      expect(mockStream.write).toHaveBeenCalledWith('\x1b8')
    })

    it('should not throw when writing to streams', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      expect(() => hideCursor(mockStream)).not.toThrow()
      expect(() => showCursor(mockStream)).not.toThrow()
      expect(() => saveCursor(mockStream)).not.toThrow()
      expect(() => restoreCursor(mockStream)).not.toThrow()
    })

    it('should support animation cleanup', () => {
      const mockStream = {
        write: vi.fn(),
      } as unknown as NodeJS.WriteStream

      hideCursor(mockStream)
      // ... animation frames ...
      showCursor(mockStream)

      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?25l')
      expect(mockStream.write).toHaveBeenCalledWith('\x1b[?25h')
    })
  })
})
