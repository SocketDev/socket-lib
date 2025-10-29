/**
 * @fileoverview Unit tests for prompt utilities.
 */

import { createSeparator } from '@socketsecurity/lib/prompts'
import { describe, expect, it } from 'vitest'

describe('prompts', () => {
  describe('createSeparator', () => {
    it('should create separator with default text', () => {
      const separator = createSeparator()
      expect(separator).toBeDefined()
      expect(separator.type).toBe('separator')
      expect(separator.separator).toBe('───────')
      expect(separator.line).toBe('───────')
    })

    it('should create separator with custom text', () => {
      const separator = createSeparator('Custom Separator')
      expect(separator.type).toBe('separator')
      expect(separator.separator).toBe('Custom Separator')
      expect(separator.line).toBe('Custom Separator')
    })

    it('should create separator with empty string', () => {
      const separator = createSeparator('')
      expect(separator.type).toBe('separator')
      expect(separator.separator).toBe('───────')
      expect(separator.line).toBe('───────')
    })

    it('should have correct type', () => {
      const separator = createSeparator()
      expect(separator.type).toBe('separator')
    })

    it('should return object with expected properties', () => {
      const separator = createSeparator('test')
      expect(separator).toHaveProperty('type')
      expect(separator).toHaveProperty('separator')
      expect(separator).toHaveProperty('line')
    })

    it('should handle various text inputs', () => {
      const testCases = [
        '─',
        '━',
        '═',
        '───────────',
        '- - - - -',
        '* * * * *',
        'SECTION',
        'Menu Options',
      ]

      for (const text of testCases) {
        const separator = createSeparator(text)
        expect(separator.type).toBe('separator')
        expect(separator.separator).toBe(text)
        expect(separator.line).toBe(text)
      }
    })

    it('should handle unicode characters', () => {
      const separator = createSeparator('━━━━━━━')
      expect(separator.separator).toBe('━━━━━━━')
      expect(separator.line).toBe('━━━━━━━')
    })

    it('should handle special characters', () => {
      const separator = createSeparator('•••••••')
      expect(separator.separator).toBe('•••••••')
      expect(separator.line).toBe('•••••••')
    })

    it('should create consistent separators for same input', () => {
      const sep1 = createSeparator('test')
      const sep2 = createSeparator('test')
      expect(sep1.type).toBe(sep2.type)
      expect(sep1.separator).toBe(sep2.separator)
      expect(sep1.line).toBe(sep2.line)
    })

    it('should create different separators for different inputs', () => {
      const sep1 = createSeparator('first')
      const sep2 = createSeparator('second')
      expect(sep1.separator).not.toBe(sep2.separator)
      expect(sep1.line).not.toBe(sep2.line)
    })

    it('should handle whitespace in text', () => {
      const separator = createSeparator('   Section   ')
      expect(separator.separator).toBe('   Section   ')
      expect(separator.line).toBe('   Section   ')
    })

    it('should handle numbers as text', () => {
      const separator = createSeparator('123')
      expect(separator.separator).toBe('123')
      expect(separator.line).toBe('123')
    })

    it('should handle long text', () => {
      const longText = 'This is a very long separator text'.repeat(5)
      const separator = createSeparator(longText)
      expect(separator.separator).toBe(longText)
      expect(separator.line).toBe(longText)
    })

    it('should be a pure function', () => {
      // Multiple calls with same input should produce equal outputs
      const text = 'test separator'
      const result1 = createSeparator(text)
      const result2 = createSeparator(text)

      expect(result1).toEqual(result2)
      expect(result1).not.toBe(result2) // Different objects
    })

    it('should not mutate input', () => {
      const text = 'immutable text'
      const textCopy = text
      createSeparator(text)
      expect(text).toBe(textCopy)
    })

    it('should handle repeated calls', () => {
      for (let i = 0; i < 100; i++) {
        const separator = createSeparator(`separator ${i}`)
        expect(separator.type).toBe('separator')
        expect(separator.separator).toBe(`separator ${i}`)
      }
    })
  })

  describe('module exports', () => {
    it('should export createSeparator function', () => {
      expect(typeof createSeparator).toBe('function')
    })

    it('should export prompt functions', async () => {
      // These are re-exports from @inquirer packages
      // We just verify they can be imported
      const { confirm, input, password, search, select } = await import(
        '@socketsecurity/lib/prompts'
      )
      expect(typeof confirm).toBe('function')
      expect(typeof input).toBe('function')
      expect(typeof password).toBe('function')
      expect(typeof search).toBe('function')
      expect(typeof select).toBe('function')
    })
  })
})
