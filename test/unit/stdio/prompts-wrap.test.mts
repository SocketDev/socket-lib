/**
 * @file Unit tests for stdio prompt wrapping and prompt-function utilities.
 *   Tests the runtime prompt machinery rather than theme conversion:
 *
 *   - wrapPrompt() injects themes, abort signals, and spinner coordination,
 *     trims string results, and swallows non-TypeError rejections
 *   - createSeparator() builds inquirer separator entries
 *   - Separator class is exported separately from select
 *   - The checkbox/confirm/input/password/search/select prompt functions are
 *     unwrapped from their module default exports and remain callable Used by
 *     Socket CLI tools for user interactions like selecting options,
 *     confirming actions.
 */

import process from 'node:process'
import {
  Separator,
  checkbox,
  confirm,
  createSeparator,
  input,
  password,
  search,
  select,
  wrapPrompt,
} from '../../../src/stdio/prompts'
import type { Context } from '../../../src/stdio/prompts'
import { describe, expect, it, vi } from 'vitest'

describe('stdio/prompts - wrapping', () => {
  describe('wrapPrompt', () => {
    it('should wrap a prompt function', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test result')
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBe('test result')
      expect(mockPrompt).toHaveBeenCalled()
    })

    it('should trim string results', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('  test result  ')
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBe('test result')
    })

    it('should not trim non-string results', async () => {
      const mockPrompt = vi.fn().mockResolvedValue(42)
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBe(42)
    })

    it('should inject theme when not provided', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped({ message: 'Test?' })
      const callArgs = mockPrompt.mock.calls[0]
      const config = callArgs?.[0] as Record<string, unknown>
      expect(config['theme']).toBeDefined()
    })

    it('should convert existing theme', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped({ message: 'Test?', theme: 'sunset' })
      const callArgs = mockPrompt.mock.calls[0]
      const config = callArgs?.[0] as Record<string, unknown>
      expect(config['theme']).toBeDefined()
      expect(typeof config['theme']).toBe('object')
    })

    it('should inject abort signal', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped({ message: 'Test?' })
      const callArgs = mockPrompt.mock.calls[0]
      const context = callArgs?.[1] as Context
      expect(context.signal).toBeDefined()
    })

    it('should handle context with existing properties', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped(
        { message: 'Test?' },
        { input: process.stdin, output: process.stdout },
      )
      const callArgs = mockPrompt.mock.calls[0]
      const context = callArgs?.[1] as Context
      expect(context.signal).toBeDefined()
      expect(context.input).toBe(process.stdin)
      expect(context.output).toBe(process.stdout)
    })

    it('should handle errors gracefully', async () => {
      const mockPrompt = vi.fn().mockRejectedValue(new Error('User cancelled'))
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBeUndefined()
    })

    it('should rethrow TypeError', async () => {
      const mockPrompt = vi.fn().mockRejectedValue(new TypeError('Bad type'))
      const wrapped = wrapPrompt(mockPrompt)

      await expect(wrapped({ message: 'Test?' })).rejects.toThrow(TypeError)
    })

    it('should handle spinner context', async () => {
      const mockSpinner = {
        isSpinning: true,
        stop: vi.fn(),
        start: vi.fn(),
      }
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped({ message: 'Test?' }, { spinner: mockSpinner })

      expect(mockSpinner.stop).toHaveBeenCalled()
      expect(mockSpinner.start).toHaveBeenCalled()
    })

    it('should not restart spinner if it was not spinning', async () => {
      const mockSpinner = {
        isSpinning: false,
        stop: vi.fn(),
        start: vi.fn(),
      }
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped({ message: 'Test?' }, { spinner: mockSpinner })

      expect(mockSpinner.stop).toHaveBeenCalled()
      expect(mockSpinner.start).not.toHaveBeenCalled()
    })

    it('should handle null config', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      // Pass null as config to trigger the branch where config is not an object
      const result = await wrapped(undefined)
      expect(result).toBe('test')
      expect(mockPrompt).toHaveBeenCalled()
    })

    it('should handle undefined config', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      // Pass undefined as config
      const result = await wrapped(undefined)
      expect(result).toBe('test')
      expect(mockPrompt).toHaveBeenCalled()
    })

    it('should handle string config', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      // Pass a non-object value as config
      const result = await wrapped('not an object')
      expect(result).toBe('test')
      expect(mockPrompt).toHaveBeenCalled()
    })

    it('should handle array config', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      // Pass an array (which is technically an object but not the expected config)
      const result = await wrapped([1, 2, 3])
      expect(result).toBe('test')
      expect(mockPrompt).toHaveBeenCalled()
    })
  })

  describe('createSeparator', () => {
    it('should create a separator without text', () => {
      const sep = createSeparator()
      expect(sep).toBeDefined()
      expect(sep.type).toBe('separator')
    })

    it('should create a separator with custom text', () => {
      const sep = createSeparator('---')
      expect(sep).toBeDefined()
      expect(sep.type).toBe('separator')
      expect(sep.separator).toBe('---')
    })
  })

  describe('prompt functions exist', () => {
    it('should export checkbox function', () => {
      expect(typeof checkbox).toBe('function')
    })

    it('should export confirm function', () => {
      expect(typeof confirm).toBe('function')
    })

    it('should export input function', () => {
      expect(typeof input).toBe('function')
    })

    it('should export password function', () => {
      expect(typeof password).toBe('function')
    })

    it('should export search function', () => {
      expect(typeof search).toBe('function')
    })

    it('should export select function', () => {
      expect(typeof select).toBe('function')
    })
  })

  describe('prompt functions are properly unwrapped', () => {
    it('should unwrap checkbox from module exports', () => {
      // Verify checkbox is a function, not an object with .default.
      expect(typeof checkbox).toBe('function')
      expect(checkbox).not.toHaveProperty('default')
    })

    it('should unwrap confirm from module exports', () => {
      // Verify confirm is a function, not an object with .default.
      expect(typeof confirm).toBe('function')
      expect(confirm).not.toHaveProperty('default')
    })

    it('should unwrap input from module exports', () => {
      // Verify input is a function, not an object with .default.
      expect(typeof input).toBe('function')
      expect(input).not.toHaveProperty('default')
    })

    it('should unwrap password from module exports', () => {
      // Verify password is a function, not an object with .default.
      expect(typeof password).toBe('function')
      expect(password).not.toHaveProperty('default')
    })

    it('should unwrap search from module exports with named exports', () => {
      // Search has named exports in addition to default, must use .default accessor.
      expect(typeof search).toBe('function')
      expect(search).not.toHaveProperty('default')
    })

    it('should unwrap select from module exports with named exports', () => {
      // Select has Separator export in addition to default, must use .default accessor.
      expect(typeof select).toBe('function')
      expect(select).not.toHaveProperty('default')
      expect(select).not.toHaveProperty('Separator')
    })

    it('should be callable without "inquirerPrompt is not a function" error', async () => {
      // This test verifies the fix for the bug where wrapPrompt received.
      // an object instead of a function for modules with multiple exports.
      // All wrapped prompts should be callable.
      const prompts = [checkbox, confirm, input, password, search, select]
      for (let i = 0, { length } = prompts; i < length; i += 1) {
        const prompt = prompts[i]!
        expect(() => wrapPrompt(prompt)).not.toThrow()
      }
    })

    it('should export Separator class separately from select', () => {
      // Separator should be exported as a named export, not a property on select.
      expect(Separator).toBeDefined()
      expect(typeof Separator).toBe('function')
      expect(Separator.name).toBe('Separator')

      // Verify we can instantiate Separator.
      const sep = new Separator()
      expect(sep.type).toBe('separator')
    })

    it('should create Separator instances with custom text', () => {
      const customSep = new Separator('---custom---')
      expect(customSep.type).toBe('separator')
      expect(customSep.separator).toBe('---custom---')
    })
  })

  describe('wrapPrompt with complex scenarios', () => {
    it('should handle prompt returning array', async () => {
      const mockPrompt = vi.fn().mockResolvedValue(['option1', 'option2'])
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toEqual(['option1', 'option2'])
    })

    it('should handle prompt returning object', async () => {
      const mockPrompt = vi.fn().mockResolvedValue({ value: 42 })
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toEqual({ value: 42 })
    })

    it('should handle prompt returning boolean false', async () => {
      const mockPrompt = vi.fn().mockResolvedValue(false)
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBe(false)
    })

    it('should handle prompt returning empty string', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('')
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBe('')
    })

    it('should handle prompt with multiple args', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped(
        { message: 'Test?' },
        { signal: new AbortController().signal },
        'extra arg',
      )
      expect(result).toBe('test')
      expect(mockPrompt).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'extra arg',
      )
    })

    it('should handle error with non-TypeError', async () => {
      const mockPrompt = vi.fn().mockRejectedValue(new Error('Other error'))
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped({ message: 'Test?' })
      expect(result).toBeUndefined()
    })

    it('should handle error after spinner was spinning', async () => {
      const mockSpinner = {
        isSpinning: true,
        stop: vi.fn(),
        start: vi.fn(),
      }
      const mockPrompt = vi.fn().mockRejectedValue(new Error('Prompt failed'))
      const wrapped = wrapPrompt(mockPrompt)

      const result = await wrapped(
        { message: 'Test?' },
        { spinner: mockSpinner },
      )
      expect(result).toBeUndefined()
      expect(mockSpinner.stop).toHaveBeenCalled()
      // The spinner was spinning, so it tries to start again even after error
      expect(mockSpinner.start).toHaveBeenCalled()
    })
  })

  describe('createSeparator edge cases', () => {
    it('should handle empty string separator', () => {
      const sep = createSeparator('')
      expect(sep).toBeDefined()
      expect(sep.type).toBe('separator')
      // Empty string gets default separator value
      expect(sep.separator).toBeDefined()
    })

    it('should handle very long separator text', () => {
      const longText = '='.repeat(1000)
      const sep = createSeparator(longText)
      expect(sep).toBeDefined()
      expect(sep.separator).toBe(longText)
    })

    it('should handle special characters', () => {
      const specialText = '─────────'
      const sep = createSeparator(specialText)
      expect(sep).toBeDefined()
      expect(sep.separator).toBe(specialText)
    })

    it('should handle unicode characters', () => {
      const unicodeText = '━━━ 🔥 ━━━'
      const sep = createSeparator(unicodeText)
      expect(sep).toBeDefined()
      expect(sep.separator).toBe(unicodeText)
    })
  })
})
