/**
 * @fileoverview Unit tests for console divider utilities.
 *
 * Tests divider and separator utilities:
 * - divider() - creates divider lines with custom characters and widths
 * - dividers - preset divider styles (thick, thin, dotted, etc.)
 * - printDivider() - prints dividers to console
 * - sectionBreak() - creates section separators with spacing
 * - Convenience functions: printThickDivider(), printThinDivider(), printDottedDivider()
 * Used by Socket CLI for visual separation in terminal output.
 */

import {
  divider,
  dividers,
  printDivider,
  printDottedDivider,
  printSectionBreak,
  printThickDivider,
  printThinDivider,
  sectionBreak,
} from '@socketsecurity/lib/stdio/divider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('stdio/divider', () => {
  describe('divider', () => {
    it('should create default divider with 55 "═" characters', () => {
      const result = divider()
      expect(result).toBe('═'.repeat(55))
      expect(result).toHaveLength(55)
    })

    it('should create divider with custom character', () => {
      const result = divider({ char: '-' })
      expect(result).toBe('-'.repeat(55))
    })

    it('should create divider with custom width', () => {
      const result = divider({ width: 30 })
      expect(result).toBe('═'.repeat(30))
      expect(result).toHaveLength(30)
    })

    it('should create divider with custom character and width', () => {
      const result = divider({ char: '*', width: 20 })
      expect(result).toBe('*'.repeat(20))
      expect(result).toHaveLength(20)
    })

    it('should handle width of 0', () => {
      const result = divider({ width: 0 })
      expect(result).toBe('')
      expect(result).toHaveLength(0)
    })

    it('should handle width of 1', () => {
      const result = divider({ width: 1 })
      expect(result).toBe('═')
      expect(result).toHaveLength(1)
    })

    it('should handle multi-character strings', () => {
      const result = divider({ char: '=-', width: 10 })
      expect(result).toBe('=-'.repeat(10))
      expect(result).toHaveLength(20)
    })

    it('should handle unicode characters', () => {
      const result = divider({ char: '◆', width: 10 })
      expect(result).toBe('◆'.repeat(10))
    })

    it('should handle empty options object', () => {
      const result = divider({})
      expect(result).toBe('═'.repeat(55))
    })
  })

  describe('dividers', () => {
    it('should have thick divider', () => {
      const result = dividers.thick()
      expect(result).toBe('═'.repeat(55))
    })

    it('should have thin divider', () => {
      const result = dividers.thin()
      expect(result).toBe('─'.repeat(55))
    })

    it('should have double divider (alias for thick)', () => {
      const result = dividers.double()
      expect(result).toBe('═'.repeat(55))
      expect(result).toBe(dividers.thick())
    })

    it('should have single divider', () => {
      const result = dividers.single()
      expect(result).toBe('-'.repeat(55))
    })

    it('should have dotted divider', () => {
      const result = dividers.dotted()
      expect(result).toBe('·'.repeat(55))
    })

    it('should have dashed divider', () => {
      const result = dividers.dashed()
      expect(result).toBe('╌'.repeat(55))
    })

    it('should have wave divider', () => {
      const result = dividers.wave()
      expect(result).toBe('~'.repeat(55))
    })

    it('should have star divider', () => {
      const result = dividers.star()
      expect(result).toBe('*'.repeat(55))
    })

    it('should have diamond divider', () => {
      const result = dividers.diamond()
      expect(result).toBe('◆'.repeat(55))
    })

    it('should have arrow divider', () => {
      const result = dividers.arrow()
      expect(result).toBe('→'.repeat(55))
    })
  })

  describe('printDivider', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
    })

    it('should print default divider to console', () => {
      printDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('═'.repeat(55))
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })

    it('should print custom divider to console', () => {
      printDivider({ char: '-', width: 30 })
      expect(consoleLogSpy).toHaveBeenCalledWith('-'.repeat(30))
    })

    it('should print divider with custom character', () => {
      printDivider({ char: '·' })
      expect(consoleLogSpy).toHaveBeenCalledWith('·'.repeat(55))
    })

    it('should print divider with custom width', () => {
      printDivider({ width: 20 })
      expect(consoleLogSpy).toHaveBeenCalledWith('═'.repeat(20))
    })
  })

  describe('printThickDivider', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
      vi.clearAllMocks()
    })

    it('should print thick divider to console', () => {
      printThickDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('═'.repeat(55))
    })
  })

  describe('printThinDivider', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
      vi.clearAllMocks()
    })

    it('should print thin divider to console', () => {
      printThinDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })
  })

  describe('printDottedDivider', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
    })

    it('should print dotted divider to console', () => {
      printDottedDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('·'.repeat(55))
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('sectionBreak', () => {
    it('should create section break with newlines', () => {
      const result = sectionBreak()
      expect(result).toBe(`\n${'═'.repeat(55)}\n`)
    })

    it('should create section break with custom character', () => {
      const result = sectionBreak({ char: '-' })
      expect(result).toBe(`\n${'-'.repeat(55)}\n`)
    })

    it('should create section break with custom width', () => {
      const result = sectionBreak({ width: 30 })
      expect(result).toBe(`\n${'═'.repeat(30)}\n`)
    })

    it('should create section break with custom character and width', () => {
      const result = sectionBreak({ char: '*', width: 20 })
      expect(result).toBe(`\n${'*'.repeat(20)}\n`)
    })

    it('should start and end with newline', () => {
      const result = sectionBreak()
      expect(result.startsWith('\n')).toBe(true)
      expect(result.endsWith('\n')).toBe(true)
    })

    it('should have exactly one newline at start and end', () => {
      const result = sectionBreak()
      const lines = result.split('\n')
      expect(lines).toHaveLength(3)
      expect(lines[0]).toBe('')
      expect(lines[1]).toBe('═'.repeat(55))
      expect(lines[2]).toBe('')
    })
  })

  describe('printSectionBreak', () => {
    let consoleLogSpy: any

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleLogSpy.mockRestore()
    })

    it('should print section break to console', () => {
      printSectionBreak()
      expect(consoleLogSpy).toHaveBeenCalledWith(`\n${'═'.repeat(55)}\n`)
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })

    it('should print section break with custom options', () => {
      printSectionBreak({ char: '-', width: 30 })
      expect(consoleLogSpy).toHaveBeenCalledWith(`\n${'-'.repeat(30)}\n`)
    })
  })
})
