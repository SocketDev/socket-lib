/**
 * @fileoverview Unit tests for console header/banner formatting utilities.
 *
 * Tests header and banner formatting utilities:
 * - createHeader() - creates formatted headers with borders and centered titles
 * - createSectionHeader() - creates lightweight section headers
 * - printHeader() - prints headers to console
 * - printFooter() - prints footers with optional messages
 * - Options: width, borderChar, padding, color, bold
 * Used by Socket CLI for visual structure and section markers in terminal output.
 */

import { stripAnsi } from '@socketsecurity/lib/ansi'
import {
  createHeader,
  createSectionHeader,
  printFooter,
  printHeader,
} from '@socketsecurity/lib/stdio/header'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('stdio/header', () => {
  describe('createHeader', () => {
    it('should create default header with cyan bold title', () => {
      const result = createHeader('Test Title')
      const lines = result.split('\n')

      expect(lines).toHaveLength(5)
      expect(lines[0]).toBe('='.repeat(80))
      expect(lines[4]).toBe('='.repeat(80))

      const plainTitle = stripAnsi(lines[2] ?? '')
      expect(plainTitle.trim()).toBe('Test Title')
    })

    it('should center title within specified width', () => {
      const result = createHeader('Test', { width: 20 })
      const lines = result.split('\n')

      expect(lines[0]).toBe('='.repeat(20))
      expect(lines[4]).toBe('='.repeat(20))

      const plainTitle = stripAnsi(lines[2] ?? '')
      expect(plainTitle).toHaveLength(20)
      expect(plainTitle.trim()).toBe('Test')
    })

    it('should use custom border character', () => {
      const result = createHeader('Test', { borderChar: '-' })
      const lines = result.split('\n')

      expect(lines[0]).toBe('-'.repeat(80))
      expect(lines[4]).toBe('-'.repeat(80))
    })

    it('should use custom width', () => {
      const result = createHeader('Test', { width: 50 })
      const lines = result.split('\n')

      expect(lines[0]).toBe('='.repeat(50))
      expect(lines[0]).toHaveLength(50)
    })

    it('should apply custom padding', () => {
      const result = createHeader('Test', { padding: 0 })
      const lines = result.split('\n')

      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('='.repeat(80))
      expect(lines[2]).toBe('='.repeat(80))
    })

    it('should apply multiple padding lines', () => {
      const result = createHeader('Test', { padding: 3 })
      const lines = result.split('\n')

      expect(lines).toHaveLength(9)
      expect(lines[0]).toBe('='.repeat(80))
      expect(lines[1]).toBe(' '.repeat(80))
      expect(lines[2]).toBe(' '.repeat(80))
      expect(lines[3]).toBe(' '.repeat(80))
      expect(lines[5]).toBe(' '.repeat(80))
      expect(lines[6]).toBe(' '.repeat(80))
      expect(lines[7]).toBe(' '.repeat(80))
      expect(lines[8]).toBe('='.repeat(80))
    })

    it('should apply cyan color by default', () => {
      const result = createHeader('Test')
      expect(result).toContain('\x1b[36m')
    })

    it('should apply green color', () => {
      const result = createHeader('Test', { color: 'green' })
      expect(result).toContain('\x1b[32m')
    })

    it('should apply yellow color', () => {
      const result = createHeader('Test', { color: 'yellow' })
      expect(result).toContain('\x1b[33m')
    })

    it('should apply blue color', () => {
      const result = createHeader('Test', { color: 'blue' })
      expect(result).toContain('\x1b[34m')
    })

    it('should apply magenta color', () => {
      const result = createHeader('Test', { color: 'magenta' })
      expect(result).toContain('\x1b[35m')
    })

    it('should apply red color', () => {
      const result = createHeader('Test', { color: 'red' })
      expect(result).toContain('\x1b[31m')
    })

    it('should apply gray color', () => {
      const result = createHeader('Test', { color: 'gray' })
      expect(result).toContain('\x1b[90m')
    })

    it('should apply bold by default', () => {
      const result = createHeader('Test')
      expect(result).toContain('\x1b[1m')
    })

    it('should not apply bold when bold is false', () => {
      const result = createHeader('Test', { bold: false })
      expect(result).toContain('\x1b[36m')
      const lines = result.split('\n')
      const titleLine = lines[2] ?? ''
      const boldEscape = '\x1b[1m'
      const boldCount = titleLine.split(boldEscape).length - 1
      expect(boldCount).toBe(0)
    })

    it('should handle empty title', () => {
      const result = createHeader('')
      const lines = result.split('\n')
      expect(lines).toHaveLength(5)
      expect(lines[0]).toBe('='.repeat(80))
    })

    it('should handle long title', () => {
      const longTitle = 'A'.repeat(100)
      const result = createHeader(longTitle, { width: 80 })
      const lines = result.split('\n')
      expect(lines).toHaveLength(5)
      expect(lines[0]).toBe('='.repeat(80))
    })

    it('should handle width of 1', () => {
      const result = createHeader('X', { width: 1 })
      const lines = result.split('\n')
      expect(lines[0]).toBe('=')
    })

    it('should handle multi-character border', () => {
      const result = createHeader('Test', { borderChar: '=-', width: 10 })
      const lines = result.split('\n')
      expect(lines[0]).toBe('=-'.repeat(10))
    })

    it('should combine all options', () => {
      const result = createHeader('Custom Header', {
        width: 60,
        borderChar: '*',
        padding: 2,
        color: 'yellow',
        bold: false,
      })

      const lines = result.split('\n')
      expect(lines).toHaveLength(7)
      expect(lines[0]).toBe('*'.repeat(60))
      expect(lines[6]).toBe('*'.repeat(60))
      expect(result).toContain('\x1b[33m')

      const plainTitle = stripAnsi(lines[3] ?? '')
      expect(plainTitle.trim()).toBe('Custom Header')
    })
  })

  describe('createSectionHeader', () => {
    it('should create section header with default options', () => {
      const result = createSectionHeader('Section')
      const lines = result.split('\n')

      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('-'.repeat(60))
      expect(lines[2]).toBe('-'.repeat(60))

      const plainTitle = stripAnsi(lines[1] ?? '')
      expect(plainTitle.trim()).toBe('Section')
    })

    it('should use blue color by default', () => {
      const result = createSectionHeader('Section')
      expect(result).toContain('\x1b[34m')
    })

    it('should not be bold', () => {
      const result = createSectionHeader('Section')
      const lines = result.split('\n')
      const titleLine = lines[1] ?? ''
      const boldEscape = '\x1b[1m'
      const boldCount = titleLine.split(boldEscape).length - 1
      expect(boldCount).toBe(0)
    })

    it('should have padding of 0', () => {
      const result = createSectionHeader('Section')
      const lines = result.split('\n')
      expect(lines).toHaveLength(3)
    })

    it('should use custom width', () => {
      const result = createSectionHeader('Section', { width: 40 })
      const lines = result.split('\n')
      expect(lines[0]).toBe('-'.repeat(40))
      expect(lines[0]).toHaveLength(40)
    })

    it('should use custom border character', () => {
      const result = createSectionHeader('Section', { borderChar: '~' })
      const lines = result.split('\n')
      expect(lines[0]).toBe('~'.repeat(60))
    })

    it('should use custom color', () => {
      const result = createSectionHeader('Section', { color: 'green' })
      expect(result).toContain('\x1b[32m')
    })

    it('should handle empty title', () => {
      const result = createSectionHeader('')
      const lines = result.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('-'.repeat(60))
    })

    it('should combine custom options', () => {
      const result = createSectionHeader('Subsection', {
        width: 50,
        borderChar: '·',
        color: 'magenta',
      })

      const lines = result.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('·'.repeat(50))
      expect(result).toContain('\x1b[35m')

      const plainTitle = stripAnsi(lines[1] ?? '')
      expect(plainTitle.trim()).toBe('Subsection')
    })
  })

  describe('printHeader', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
    })

    it('should print header with borders', () => {
      printHeader('Test Title')
      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '═'.repeat(55))
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  Test Title')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '═'.repeat(55))
    })

    it('should indent title with 2 spaces', () => {
      printHeader('Title')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  Title')
    })

    it('should use fixed width of 55', () => {
      printHeader('Any Length Title Here')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '═'.repeat(55))
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '═'.repeat(55))
    })

    it('should handle empty title', () => {
      printHeader('')
      expect(consoleLogSpy).toHaveBeenCalledWith('  ')
    })

    it('should handle long title', () => {
      const longTitle = 'A'.repeat(100)
      printHeader(longTitle)
      expect(consoleLogSpy).toHaveBeenCalledWith(`  ${longTitle}`)
    })
  })

  describe('printFooter', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
    })

    it('should print footer with border only when no message', () => {
      printFooter()
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })

    it('should print footer with message in green', () => {
      printFooter('Success!')
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '─'.repeat(55))

      const secondCall = consoleLogSpy.mock.calls[1]?.[0]
      expect(secondCall).toContain('\x1b[32m')
      expect(secondCall).toContain('Success!')
    })

    it('should use thin border character', () => {
      printFooter('Done')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '─'.repeat(55))
    })

    it('should use fixed width of 55', () => {
      printFooter('Message')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '─'.repeat(55))
    })

    it('should handle empty string message', () => {
      printFooter('')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should handle undefined message', () => {
      printFooter(undefined)
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })

    it('should handle long message', () => {
      const longMessage = 'Success! '.repeat(20)
      printFooter(longMessage)
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)

      const secondCall = consoleLogSpy.mock.calls[1]?.[0]
      expect(secondCall).toContain(longMessage)
    })
  })
})
