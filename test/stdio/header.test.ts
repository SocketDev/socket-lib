/**
 * @fileoverview Unit tests for console header formatting utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createHeader,
  createSectionHeader,
  printFooter,
  printHeader,
} from '@socketsecurity/lib/stdio/header'

describe('stdio/header', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('createHeader', () => {
    it('should export createHeader function', () => {
      expect(typeof createHeader).toBe('function')
    })

    it('should create header with default options', () => {
      const result = createHeader('Test Title')
      expect(result).toContain('Test Title')
      expect(result).toContain('='.repeat(80))
    })

    it('should create header with custom width', () => {
      const result = createHeader('Title', { width: 50 })
      expect(result).toContain('='.repeat(50))
    })

    it('should create header with custom border char', () => {
      const result = createHeader('Title', { borderChar: '-' })
      expect(result).toContain('-'.repeat(80))
    })

    it('should create header with custom padding', () => {
      const result = createHeader('Title', { padding: 2 })
      const lines = result.split('\n')
      expect(lines.length).toBe(7) // border + 2 padding + title + 2 padding + border
    })

    it('should create header with zero padding', () => {
      const result = createHeader('Title', { padding: 0 })
      const lines = result.split('\n')
      expect(lines.length).toBe(3) // border + title + border
    })

    it('should create header with custom color', () => {
      const result = createHeader('Title', { color: 'red' })
      expect(result).toContain('Title')
    })

    it('should handle bold: false option', () => {
      const result = createHeader('Title', { bold: false })
      expect(result).toContain('Title')
    })

    it('should handle bold: true option (default)', () => {
      const result = createHeader('Title', { bold: true })
      expect(result).toContain('Title')
    })

    it('should center the title text', () => {
      const result = createHeader('Title', { width: 50 })
      const lines = result.split('\n')
      const titleLine = lines[2] // border, padding, title
      expect(titleLine.length).toBeGreaterThanOrEqual(50)
    })

    it('should handle empty title', () => {
      const result = createHeader('')
      expect(result).toContain('='.repeat(80))
      const lines = result.split('\n')
      expect(lines.length).toBeGreaterThan(0)
    })

    it('should handle very long title', () => {
      const longTitle = 'A'.repeat(100)
      const result = createHeader(longTitle, { width: 80 })
      expect(result).toContain(longTitle)
    })

    it('should handle multi-word title', () => {
      const result = createHeader('Socket Security Analysis')
      expect(result).toContain('Socket Security Analysis')
    })

    it('should handle title with special characters', () => {
      const result = createHeader('Title: @socket/lib')
      expect(result).toContain('@socket/lib')
    })

    it('should handle Unicode in title', () => {
      const result = createHeader('テスト Title')
      expect(result).toContain('テスト Title')
    })

    it('should handle all color options', () => {
      const colors = [
        'cyan',
        'green',
        'yellow',
        'blue',
        'magenta',
        'red',
        'gray',
      ]
      for (const color of colors) {
        const result = createHeader('Title', {
          color: color as
            | 'cyan'
            | 'green'
            | 'yellow'
            | 'blue'
            | 'magenta'
            | 'red'
            | 'gray',
        })
        expect(result).toContain('Title')
      }
    })

    it('should handle undefined color', () => {
      const result = createHeader('Title', { color: undefined })
      expect(result).toContain('Title')
    })

    it('should handle small width', () => {
      const result = createHeader('Title', { width: 10 })
      expect(result).toContain('='.repeat(10))
    })

    it('should handle large width', () => {
      const result = createHeader('Title', { width: 200 })
      expect(result).toContain('='.repeat(200))
    })

    it('should handle large padding', () => {
      const result = createHeader('Title', { padding: 5 })
      const lines = result.split('\n')
      expect(lines.length).toBe(13) // border + 5 padding + title + 5 padding + border
    })

    it('should handle multi-character border', () => {
      const result = createHeader('Title', { borderChar: '=-' })
      expect(result).toContain('=-')
    })

    it('should include top and bottom borders', () => {
      const result = createHeader('Title')
      const lines = result.split('\n')
      expect(lines[0]).toBe('='.repeat(80))
      expect(lines[lines.length - 1]).toBe('='.repeat(80))
    })

    it('should return a string', () => {
      const result = createHeader('Title')
      expect(typeof result).toBe('string')
    })

    it('should have consistent line count based on padding', () => {
      const result0 = createHeader('Title', { padding: 0 })
      const result1 = createHeader('Title', { padding: 1 })
      const result2 = createHeader('Title', { padding: 2 })

      expect(result0.split('\n').length).toBe(3)
      expect(result1.split('\n').length).toBe(5)
      expect(result2.split('\n').length).toBe(7)
    })
  })

  describe('createSectionHeader', () => {
    it('should export createSectionHeader function', () => {
      expect(typeof createSectionHeader).toBe('function')
    })

    it('should create section header with defaults', () => {
      const result = createSectionHeader('Section Title')
      expect(result).toContain('Section Title')
      expect(result).toContain('-'.repeat(60))
    })

    it('should use dash as default border char', () => {
      const result = createSectionHeader('Section')
      expect(result).toContain('-'.repeat(60))
    })

    it('should use width 60 as default', () => {
      const result = createSectionHeader('Section')
      expect(result).toContain('-'.repeat(60))
    })

    it('should have no padding by default', () => {
      const result = createSectionHeader('Section')
      const lines = result.split('\n')
      expect(lines.length).toBe(3) // border + title + border
    })

    it('should accept custom width', () => {
      const result = createSectionHeader('Section', { width: 40 })
      expect(result).toContain('-'.repeat(40))
    })

    it('should accept custom border char', () => {
      const result = createSectionHeader('Section', { borderChar: '~' })
      expect(result).toContain('~'.repeat(60))
    })

    it('should accept custom color', () => {
      const result = createSectionHeader('Section', { color: 'cyan' })
      expect(result).toContain('Section')
    })

    it('should not be bold by default', () => {
      const result = createSectionHeader('Section')
      expect(result).toContain('Section')
    })

    it('should handle empty title', () => {
      const result = createSectionHeader('')
      const lines = result.split('\n')
      expect(lines.length).toBe(3)
    })

    it('should handle long title', () => {
      const longTitle = 'Very Long Section Title That Exceeds Normal Width'
      const result = createSectionHeader(longTitle)
      expect(result).toContain(longTitle)
    })

    it('should handle special characters', () => {
      const result = createSectionHeader('Section: Dependencies')
      expect(result).toContain('Dependencies')
    })

    it('should return a string', () => {
      const result = createSectionHeader('Section')
      expect(typeof result).toBe('string')
    })
  })

  describe('printHeader', () => {
    it('should export printHeader function', () => {
      expect(typeof printHeader).toBe('function')
    })

    it('should print header to console', () => {
      printHeader('Test Title')
      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
    })

    it('should print top border', () => {
      printHeader('Title')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '═'.repeat(55))
    })

    it('should print title with indent', () => {
      printHeader('Title')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  Title')
    })

    it('should print bottom border', () => {
      printHeader('Title')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '═'.repeat(55))
    })

    it('should use width of 55', () => {
      printHeader('Title')
      const borderCall = consoleLogSpy.mock.calls[0][0] as string
      expect(borderCall.length).toBe(55)
    })

    it('should use double-line border character', () => {
      printHeader('Title')
      expect(consoleLogSpy).toHaveBeenCalledWith('═'.repeat(55))
    })

    it('should handle empty title', () => {
      printHeader('')
      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  ')
    })

    it('should handle long title', () => {
      const longTitle = 'A'.repeat(100)
      printHeader(longTitle)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, `  ${longTitle}`)
    })

    it('should handle title with special characters', () => {
      printHeader('Title: @test/package')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  Title: @test/package')
    })

    it('should handle Unicode characters', () => {
      printHeader('テスト Title')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '  テスト Title')
    })

    it('should not return a value', () => {
      const result = printHeader('Title')
      expect(result).toBeUndefined()
    })
  })

  describe('printFooter', () => {
    it('should export printFooter function', () => {
      expect(typeof printFooter).toBe('function')
    })

    it('should print footer with message', () => {
      printFooter('Complete')
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
    })

    it('should print footer without message', () => {
      printFooter()
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })

    it('should print border', () => {
      printFooter()
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })

    it('should use width of 55', () => {
      printFooter()
      const borderCall = consoleLogSpy.mock.calls[0][0] as string
      expect(borderCall.length).toBe(55)
    })

    it('should use single-line border character', () => {
      printFooter()
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })

    it('should print message in green', () => {
      printFooter('Success')
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
      // Message is colored green (implementation detail)
      const messageCall = consoleLogSpy.mock.calls[1][0]
      expect(typeof messageCall).toBe('string')
    })

    it('should handle empty message', () => {
      printFooter('')
      // Empty message only prints divider line, not message line
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })

    it('should handle long message', () => {
      const longMessage = 'A'.repeat(100)
      printFooter(longMessage)
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
    })

    it('should handle undefined message', () => {
      printFooter(undefined)
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })

    it('should handle message with special characters', () => {
      printFooter('Complete: 100%')
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
    })

    it('should handle Unicode message', () => {
      printFooter('完了')
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
    })

    it('should not return a value', () => {
      const result = printFooter('Message')
      expect(result).toBeUndefined()
    })

    it('should print border before message', () => {
      printFooter('Message')
      const borderCall = consoleLogSpy.mock.calls[0][0] as string
      expect(borderCall).toBe('─'.repeat(55))
    })
  })

  describe('integration', () => {
    it('should support header and footer pair', () => {
      printHeader('Analysis')
      printFooter('Complete')
      expect(consoleLogSpy).toHaveBeenCalledTimes(5)
    })

    it('should support createHeader and createSectionHeader together', () => {
      const main = createHeader('Main Title')
      const section = createSectionHeader('Subsection')
      expect(main).toContain('=')
      expect(section).toContain('-')
    })

    it('should support multiple section headers', () => {
      const section1 = createSectionHeader('Section 1')
      const section2 = createSectionHeader('Section 2')
      const section3 = createSectionHeader('Section 3')
      expect(section1).toContain('Section 1')
      expect(section2).toContain('Section 2')
      expect(section3).toContain('Section 3')
    })

    it('should support different header styles', () => {
      const thick = createHeader('Thick', { borderChar: '=' })
      const thin = createHeader('Thin', { borderChar: '-' })
      const dotted = createHeader('Dotted', { borderChar: '·' })
      expect(thick).toContain('=')
      expect(thin).toContain('-')
      expect(dotted).toContain('·')
    })

    it('should support nested structure', () => {
      printHeader('Main Report')
      console.log(createSectionHeader('Dependencies'))
      console.log('  - lodash')
      console.log('  - react')
      console.log(createSectionHeader('Dev Dependencies'))
      console.log('  - vitest')
      printFooter('Report complete')
      expect(consoleLogSpy).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should handle zero width', () => {
      const result = createHeader('Title', { width: 0 })
      expect(result).toContain('Title')
    })

    it('should handle width of 1', () => {
      const result = createHeader('Title', { width: 1 })
      const lines = result.split('\n')
      expect(lines[0].length).toBeGreaterThanOrEqual(1)
    })

    it('should handle negative padding', () => {
      const result = createHeader('Title', { padding: -1 })
      const lines = result.split('\n')
      // Negative padding should be handled gracefully
      expect(lines.length).toBeGreaterThan(0)
    })

    it('should handle empty border char', () => {
      const result = createHeader('Title', { borderChar: '' })
      expect(result).toContain('Title')
    })

    it('should handle very long border char', () => {
      const result = createHeader('Title', { borderChar: '=-='.repeat(10) })
      expect(result).toContain('Title')
    })

    it('should handle title with newlines', () => {
      const result = createHeader('Line1\nLine2')
      expect(result).toContain('Line1')
    })

    it('should handle title with tabs', () => {
      const result = createHeader('Title\tWith\tTabs')
      expect(result).toContain('Title')
    })
  })

  describe('real-world usage', () => {
    it('should create CLI tool header', () => {
      const header = createHeader('Socket Security CLI', {
        width: 70,
        color: 'cyan',
        bold: true,
        padding: 2,
      })
      expect(header).toContain('Socket Security CLI')
      expect(header.split('\n').length).toBe(7)
    })

    it('should create report sections', () => {
      const report = [
        createHeader('Security Analysis Report', { width: 80 }),
        createSectionHeader('Summary'),
        createSectionHeader('Vulnerabilities'),
        createSectionHeader('Recommendations'),
      ]
      expect(report.length).toBe(4)
      for (const section of report) {
        expect(typeof section).toBe('string')
      }
    })

    it('should create test output header', () => {
      printHeader('Running Tests')
      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
      consoleLogSpy.mockClear()

      printFooter('All tests passed')
      expect(consoleLogSpy).toHaveBeenCalledTimes(2)
    })

    it('should create build output header', () => {
      printHeader('Building Project')
      console.log('Compiling TypeScript...')
      console.log('Bundling assets...')
      printFooter('Build complete')
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should support colored headers for different sections', () => {
      const success = createHeader('Success', { color: 'green' })
      const warning = createHeader('Warning', { color: 'yellow' })
      const error = createHeader('Error', { color: 'red' })
      const info = createHeader('Info', { color: 'blue' })

      expect(success).toContain('Success')
      expect(warning).toContain('Warning')
      expect(error).toContain('Error')
      expect(info).toContain('Info')
    })
  })
})
