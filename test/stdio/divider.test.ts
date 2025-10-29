/**
 * @fileoverview Unit tests for console divider and separator utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('stdio/divider', () => {
  // Mock console.log to test print functions
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('divider', () => {
    it('should export divider function', () => {
      expect(typeof divider).toBe('function')
    })

    it('should return default divider with ═ character and width 55', () => {
      const result = divider()
      expect(result).toBe('═'.repeat(55))
      expect(result.length).toBe(55)
    })

    it('should accept custom character', () => {
      const result = divider({ char: '-' })
      expect(result).toBe('-'.repeat(55))
    })

    it('should accept custom width', () => {
      const result = divider({ width: 30 })
      expect(result).toBe('═'.repeat(30))
      expect(result.length).toBe(30)
    })

    it('should accept both custom character and width', () => {
      const result = divider({ char: '*', width: 20 })
      expect(result).toBe('*'.repeat(20))
      expect(result.length).toBe(20)
    })

    it('should handle zero width', () => {
      const result = divider({ width: 0 })
      expect(result).toBe('')
    })

    it('should handle width of 1', () => {
      const result = divider({ width: 1 })
      expect(result).toBe('═')
    })

    it('should handle very large widths', () => {
      const result = divider({ width: 1000 })
      expect(result.length).toBe(1000)
      expect(result).toBe('═'.repeat(1000))
    })

    it('should handle multi-character strings as char', () => {
      const result = divider({ char: '=-', width: 10 })
      expect(result).toBe('=-'.repeat(10))
    })

    it('should handle empty string as char', () => {
      const result = divider({ char: '', width: 10 })
      expect(result).toBe('')
    })

    it('should handle Unicode characters', () => {
      const result = divider({ char: '★', width: 10 })
      expect(result).toBe('★'.repeat(10))
    })

    it('should handle emoji characters', () => {
      const result = divider({ char: '🌟', width: 5 })
      expect(result).toBe('🌟'.repeat(5))
    })

    it('should not modify input options object', () => {
      const opts = { char: '-', width: 30 }
      const optsCopy = { ...opts }
      divider(opts)
      expect(opts).toEqual(optsCopy)
    })

    it('should handle undefined options', () => {
      const result = divider(undefined)
      expect(result).toBe('═'.repeat(55))
    })

    it('should handle empty options object', () => {
      const result = divider({})
      expect(result).toBe('═'.repeat(55))
    })

    it('should ignore color option (just ensure it does not crash)', () => {
      const result = divider({ color: (s: string) => `\x1b[31m${s}\x1b[0m` })
      expect(result).toBe('═'.repeat(55))
    })
  })

  describe('printDivider', () => {
    it('should export printDivider function', () => {
      expect(typeof printDivider).toBe('function')
    })

    it('should print default divider to console', () => {
      printDivider()
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).toHaveBeenCalledWith('═'.repeat(55))
    })

    it('should print custom divider to console', () => {
      printDivider({ char: '-', width: 40 })
      expect(consoleLogSpy).toHaveBeenCalledWith('-'.repeat(40))
    })

    it('should not return a value', () => {
      const result = printDivider()
      expect(result).toBeUndefined()
    })
  })

  describe('dividers presets', () => {
    it('should export dividers object', () => {
      expect(typeof dividers).toBe('object')
      expect(dividers).toBeDefined()
    })

    it('should have thick preset', () => {
      expect(typeof dividers.thick).toBe('function')
      const result = dividers.thick()
      expect(result).toBe('═'.repeat(55))
    })

    it('should have thin preset', () => {
      expect(typeof dividers.thin).toBe('function')
      const result = dividers.thin()
      expect(result).toBe('─'.repeat(55))
    })

    it('should have double preset (alias for thick)', () => {
      expect(typeof dividers.double).toBe('function')
      const result = dividers.double()
      expect(result).toBe('═'.repeat(55))
      expect(result).toBe(dividers.thick())
    })

    it('should have single preset', () => {
      expect(typeof dividers.single).toBe('function')
      const result = dividers.single()
      expect(result).toBe('-'.repeat(55))
    })

    it('should have dotted preset', () => {
      expect(typeof dividers.dotted).toBe('function')
      const result = dividers.dotted()
      expect(result).toBe('·'.repeat(55))
    })

    it('should have dashed preset', () => {
      expect(typeof dividers.dashed).toBe('function')
      const result = dividers.dashed()
      expect(result).toBe('╌'.repeat(55))
    })

    it('should have wave preset', () => {
      expect(typeof dividers.wave).toBe('function')
      const result = dividers.wave()
      expect(result).toBe('~'.repeat(55))
    })

    it('should have star preset', () => {
      expect(typeof dividers.star).toBe('function')
      const result = dividers.star()
      expect(result).toBe('*'.repeat(55))
    })

    it('should have diamond preset', () => {
      expect(typeof dividers.diamond).toBe('function')
      const result = dividers.diamond()
      expect(result).toBe('◆'.repeat(55))
    })

    it('should have arrow preset', () => {
      expect(typeof dividers.arrow).toBe('function')
      const result = dividers.arrow()
      expect(result).toBe('→'.repeat(55))
    })

    it('should have all presets return strings of length 55', () => {
      expect(dividers.thick().length).toBe(55)
      expect(dividers.thin().length).toBe(55)
      expect(dividers.double().length).toBe(55)
      expect(dividers.single().length).toBe(55)
      expect(dividers.dotted().length).toBe(55)
      expect(dividers.dashed().length).toBe(55)
      expect(dividers.wave().length).toBe(55)
      expect(dividers.star().length).toBe(55)
      expect(dividers.diamond().length).toBe(55)
      expect(dividers.arrow().length).toBe(55)
    })
  })

  describe('printThickDivider', () => {
    it('should export printThickDivider function', () => {
      expect(typeof printThickDivider).toBe('function')
    })

    it('should print thick divider to console', () => {
      printThickDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('═'.repeat(55))
    })

    it('should not return a value', () => {
      const result = printThickDivider()
      expect(result).toBeUndefined()
    })
  })

  describe('printThinDivider', () => {
    it('should export printThinDivider function', () => {
      expect(typeof printThinDivider).toBe('function')
    })

    it('should print thin divider to console', () => {
      printThinDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('─'.repeat(55))
    })

    it('should not return a value', () => {
      const result = printThinDivider()
      expect(result).toBeUndefined()
    })
  })

  describe('printDottedDivider', () => {
    it('should export printDottedDivider function', () => {
      expect(typeof printDottedDivider).toBe('function')
    })

    it('should print dotted divider to console', () => {
      printDottedDivider()
      expect(consoleLogSpy).toHaveBeenCalledWith('·'.repeat(55))
    })

    it('should not return a value', () => {
      const result = printDottedDivider()
      expect(result).toBeUndefined()
    })
  })

  describe('sectionBreak', () => {
    it('should export sectionBreak function', () => {
      expect(typeof sectionBreak).toBe('function')
    })

    it('should return divider with newlines before and after', () => {
      const result = sectionBreak()
      expect(result).toBe(`\n${'═'.repeat(55)}\n`)
    })

    it('should accept custom divider options', () => {
      const result = sectionBreak({ char: '-', width: 30 })
      expect(result).toBe(`\n${'-'.repeat(30)}\n`)
    })

    it('should start with newline', () => {
      const result = sectionBreak()
      expect(result.startsWith('\n')).toBe(true)
    })

    it('should end with newline', () => {
      const result = sectionBreak()
      expect(result.endsWith('\n')).toBe(true)
    })

    it('should contain divider in the middle', () => {
      const result = sectionBreak({ char: '*', width: 10 })
      expect(result).toContain('*'.repeat(10))
    })

    it('should have exactly 3 parts (newline, divider, newline)', () => {
      const result = sectionBreak()
      const parts = result.split('═'.repeat(55))
      expect(parts.length).toBe(2)
      expect(parts[0]).toBe('\n')
      expect(parts[1]).toBe('\n')
    })
  })

  describe('printSectionBreak', () => {
    it('should export printSectionBreak function', () => {
      expect(typeof printSectionBreak).toBe('function')
    })

    it('should print section break to console', () => {
      printSectionBreak()
      expect(consoleLogSpy).toHaveBeenCalledWith(`\n${'═'.repeat(55)}\n`)
    })

    it('should print custom section break to console', () => {
      printSectionBreak({ char: '~', width: 20 })
      expect(consoleLogSpy).toHaveBeenCalledWith(`\n${'~'.repeat(20)}\n`)
    })

    it('should not return a value', () => {
      const result = printSectionBreak()
      expect(result).toBeUndefined()
    })
  })

  describe('integration', () => {
    it('should work with all divider styles', () => {
      const styles = [
        dividers.thick(),
        dividers.thin(),
        dividers.double(),
        dividers.single(),
        dividers.dotted(),
        dividers.dashed(),
        dividers.wave(),
        dividers.star(),
        dividers.diamond(),
        dividers.arrow(),
      ]

      for (const style of styles) {
        expect(typeof style).toBe('string')
        expect(style.length).toBe(55)
      }
    })

    it('should create visual separation in console output', () => {
      console.log('Section 1')
      printDivider()
      console.log('Section 2')

      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, 'Section 1')
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '═'.repeat(55))
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, 'Section 2')
    })

    it('should support chaining different divider styles', () => {
      printThickDivider()
      printThinDivider()
      printDottedDivider()

      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(1, '═'.repeat(55))
      expect(consoleLogSpy).toHaveBeenNthCalledWith(2, '─'.repeat(55))
      expect(consoleLogSpy).toHaveBeenNthCalledWith(3, '·'.repeat(55))
    })
  })

  describe('edge cases', () => {
    it('should handle negative width gracefully', () => {
      const result = divider({ width: -1 })
      expect(result).toBe('')
    })

    it('should handle very large negative width', () => {
      const result = divider({ width: -1000 })
      expect(result).toBe('')
    })

    it('should handle fractional width', () => {
      const result = divider({ width: 10.5 })
      // repeatString will handle the fractional part
      expect(result.length).toBeGreaterThanOrEqual(10)
    })

    it('should handle NaN width', () => {
      const result = divider({ width: NaN })
      // NaN coerces to 0 or empty
      expect(typeof result).toBe('string')
    })

    it('should handle Infinity width', () => {
      const result = divider({ width: Infinity })
      // Should handle gracefully without hanging
      expect(typeof result).toBe('string')
    })

    it('should handle special Unicode characters', () => {
      const chars = ['•', '◆', '▪', '▸', '→', '⇒', '⟶']
      for (const char of chars) {
        const result = divider({ char, width: 10 })
        expect(result.length).toBeGreaterThanOrEqual(10)
      }
    })

    it('should handle whitespace characters', () => {
      const result = divider({ char: ' ', width: 10 })
      expect(result).toBe(' '.repeat(10))
    })

    it('should handle tab character', () => {
      const result = divider({ char: '\t', width: 5 })
      expect(result).toBe('\t'.repeat(5))
    })
  })

  describe('real-world usage', () => {
    it('should create section headers', () => {
      console.log('Report')
      printThickDivider()
      console.log('Details...')

      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
    })

    it('should support nested sections', () => {
      printThickDivider()
      console.log('Main Section')
      printThinDivider()
      console.log('Subsection')
      printDottedDivider()

      expect(consoleLogSpy).toHaveBeenCalledTimes(5)
    })

    it('should create visual separation with section breaks', () => {
      console.log('First section')
      printSectionBreak()
      console.log('Second section')

      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
      expect(consoleLogSpy).toHaveBeenNthCalledWith(
        2,
        `\n${'═'.repeat(55)}\n`,
      )
    })

    it('should support custom-width dividers for narrow terminals', () => {
      const narrowDiv = divider({ width: 40 })
      expect(narrowDiv.length).toBe(40)
    })

    it('should support custom-width dividers for wide terminals', () => {
      const wideDiv = divider({ width: 120 })
      expect(wideDiv.length).toBe(120)
    })

    it('should create consistent visual style', () => {
      const style = { char: '─', width: 50 }
      const div1 = divider(style)
      const div2 = divider(style)
      expect(div1).toBe(div2)
    })
  })
})
