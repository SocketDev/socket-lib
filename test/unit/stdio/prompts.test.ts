/**
 * @fileoverview Unit tests for stdio user prompt utilities.
 *
 * Tests inquirer.js integration and prompt utilities for interactive CLI prompts:
 * - createInquirerTheme() converts Socket themes to inquirer-compatible theme objects
 * - Choice<T> type for prompt options with value, name, description, short text, and disabled states
 * - Context type for prompt configuration (signal, input/output streams, clearPromptOnDone)
 * - Validates theme passthrough for non-Socket themes
 * - Tests type definitions for building type-safe interactive CLI prompts
 * Used by Socket CLI tools for user interactions like selecting options, confirming actions.
 */

import {
  checkbox,
  confirm,
  createInquirerTheme,
  createSeparator,
  input,
  password,
  search,
  select,
  wrapPrompt,
  type Choice,
  type Context,
} from '@socketsecurity/lib/stdio/prompts'
import { THEMES, type ThemeName } from '@socketsecurity/lib/themes/themes'
import { describe, expect, it, vi } from 'vitest'

describe('stdio/prompts', () => {
  describe('createInquirerTheme', () => {
    it('should create theme from valid inputs', () => {
      // Test that the function exists and returns an object
      const result = createInquirerTheme({})
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
    })

    it('should pass through non-Socket themes', () => {
      const inquirerTheme = { style: {}, icon: {} }
      const result = createInquirerTheme(inquirerTheme)
      expect(result).toBe(inquirerTheme)
    })

    it('should handle Theme object', () => {
      const socketTheme = {
        name: 'custom',
        colors: {
          primary: 'blue',
          secondary: 'green',
          success: 'green',
          error: 'red',
          warning: 'yellow',
          info: 'cyan',
          step: 'cyan',
        },
      }
      const theme = createInquirerTheme(socketTheme)
      expect(theme).toBeDefined()
    })
  })

  describe('Choice type', () => {
    it('should accept minimal choice', () => {
      const choice: Choice<string> = {
        value: 'option1',
      }
      expect(choice.value).toBe('option1')
    })

    it('should accept choice with name', () => {
      const choice: Choice<number> = {
        value: 1,
        name: 'First Option',
      }
      expect(choice.name).toBe('First Option')
    })

    it('should accept choice with description', () => {
      const choice: Choice<string> = {
        value: 'opt1',
        name: 'Option 1',
        description: 'This is the first option',
      }
      expect(choice.description).toBe('This is the first option')
    })

    it('should accept choice with short text', () => {
      const choice: Choice<string> = {
        value: 'long-option-value',
        name: 'Long Option Name',
        short: 'Long',
      }
      expect(choice.short).toBe('Long')
    })

    it('should accept disabled boolean', () => {
      const choice: Choice<string> = {
        value: 'disabled-option',
        disabled: true,
      }
      expect(choice.disabled).toBe(true)
    })

    it('should accept disabled reason string', () => {
      const choice: Choice<string> = {
        value: 'option',
        disabled: 'Not available in current context',
      }
      expect(choice.disabled).toBe('Not available in current context')
    })

    it('should accept all properties', () => {
      const choice: Choice<string> = {
        value: 'complete',
        name: 'Complete Option',
        description: 'A fully specified choice',
        short: 'Complete',
        disabled: false,
      }
      expect(choice.value).toBe('complete')
      expect(choice.name).toBe('Complete Option')
      expect(choice.description).toBe('A fully specified choice')
      expect(choice.short).toBe('Complete')
      expect(choice.disabled).toBe(false)
    })
  })

  describe('Context type', () => {
    it('should accept minimal context', () => {
      const context: Context = {}
      expect(context).toBeDefined()
    })

    it('should accept context with signal', () => {
      const controller = new AbortController()
      const context: Context = {
        signal: controller.signal,
      }
      expect(context.signal).toBeDefined()
    })

    it('should accept context with streams', () => {
      const context: Context = {
        input: process.stdin,
        output: process.stdout,
      }
      expect(context.input).toBe(process.stdin)
      expect(context.output).toBe(process.stdout)
    })

    it('should accept context with clearPromptOnDone', () => {
      const context: Context = {
        clearPromptOnDone: true,
      }
      expect(context.clearPromptOnDone).toBe(true)
    })

    it('should accept all context properties', () => {
      const controller = new AbortController()
      const context: Context = {
        signal: controller.signal,
        input: process.stdin,
        output: process.stdout,
        clearPromptOnDone: false,
      }
      expect(context.signal).toBeDefined()
      expect(context.input).toBe(process.stdin)
      expect(context.output).toBe(process.stdout)
      expect(context.clearPromptOnDone).toBe(false)
    })
  })

  describe('theme handling', () => {
    it('should handle null theme', () => {
      const theme = createInquirerTheme(null)
      expect(theme).toBeDefined()
    })
  })

  describe('Choice arrays', () => {
    it('should accept array of choices', () => {
      const choices: Array<Choice<number>> = [
        { value: 1, name: 'One' },
        { value: 2, name: 'Two' },
        { value: 3, name: 'Three' },
      ]
      expect(choices).toHaveLength(3)
      expect(choices[0]?.value).toBe(1)
    })

    it('should accept mixed enabled/disabled choices', () => {
      const choices: Array<Choice<string>> = [
        { value: 'option1', name: 'Option 1' },
        { value: 'option2', name: 'Option 2', disabled: true },
        { value: 'option3', name: 'Option 3', disabled: 'Coming soon' },
      ]
      expect(choices[1]?.disabled).toBe(true)
      expect(choices[2]?.disabled).toBe('Coming soon')
    })
  })

  describe('createInquirerTheme - advanced', () => {
    it('should convert Socket theme name to inquirer theme', () => {
      const theme = createInquirerTheme('sunset')
      expect(theme).toBeDefined()
      expect(theme).toHaveProperty('style')
      expect(theme).toHaveProperty('icon')
    })

    it('should convert Socket Theme object with RGB colors', () => {
      const socketTheme = {
        name: 'test',
        colors: {
          primary: [255, 100, 50] as [number, number, number],
          secondary: 'green',
          success: 'green',
          error: 'red',
          warning: 'yellow',
          info: 'cyan',
          step: 'cyan',
          prompt: [100, 150, 200] as [number, number, number],
          textDim: [80, 80, 80] as [number, number, number],
        },
      }
      const theme = createInquirerTheme(socketTheme)
      expect(theme).toBeDefined()
      expect(theme).toHaveProperty('style')
      expect(theme).toHaveProperty('icon')

      // Test that the theme style functions work
      const style = theme.style as Record<string, (text: string) => string>
      expect(typeof style.message).toBe('function')
      expect(typeof style.answer).toBe('function')
      expect(typeof style.help).toBe('function')
      expect(typeof style.description).toBe('function')
      expect(typeof style.disabled).toBe('function')
      expect(typeof style.error).toBe('function')
      expect(typeof style.highlight).toBe('function')

      // Call the functions to increase coverage
      expect(style.message('test')).toBeDefined()
      expect(style.answer('test')).toBeDefined()
      expect(style.help('test')).toBeDefined()
      expect(style.description('test')).toBeDefined()
      expect(style.disabled('test')).toBeDefined()
      expect(style.error('test')).toBeDefined()
      expect(style.highlight('test')).toBeDefined()
    })

    it('should handle THEMES object reference', () => {
      const theme = createInquirerTheme(THEMES.sunset)
      expect(theme).toBeDefined()
      expect(theme).toHaveProperty('style')
    })
  })

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
      expect(config.theme).toBeDefined()
    })

    it('should convert existing theme', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      await wrapped({ message: 'Test?', theme: 'sunset' })
      const callArgs = mockPrompt.mock.calls[0]
      const config = callArgs?.[0] as Record<string, unknown>
      expect(config.theme).toBeDefined()
      expect(typeof config.theme).toBe('object')
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
      const result = await wrapped(null)
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
      const result = await wrapped('not an object' as any)
      expect(result).toBe('test')
      expect(mockPrompt).toHaveBeenCalled()
    })

    it('should handle array config', async () => {
      const mockPrompt = vi.fn().mockResolvedValue('test')
      const wrapped = wrapPrompt(mockPrompt)

      // Pass an array (which is technically an object but not the expected config)
      const result = await wrapped([1, 2, 3] as any)
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

  describe('theme color edge cases', () => {
    it('should handle theme with all named colors', () => {
      const theme = createInquirerTheme({
        name: 'named-colors',
        colors: {
          primary: 'blue',
          secondary: 'green',
          success: 'green',
          error: 'red',
          warning: 'yellow',
          info: 'cyan',
          step: 'magenta',
          prompt: 'white',
          textDim: 'gray',
        },
      })
      expect(theme).toBeDefined()
      const style = theme.style as Record<string, (text: string) => string>
      expect(style.message('test')).toBeDefined()
    })

    it('should handle theme with mixed named and RGB colors', () => {
      const theme = createInquirerTheme({
        name: 'mixed',
        colors: {
          primary: 'blue',
          secondary: [100, 200, 50] as [number, number, number],
          success: 'green',
          error: [255, 0, 0] as [number, number, number],
          warning: 'yellow',
          info: 'cyan',
          step: 'cyan',
          prompt: [200, 200, 200] as [number, number, number],
          textDim: 'gray',
        },
      })
      const style = theme.style as Record<string, (text: string) => string>
      expect(style.message('test')).toContain('test')
      expect(style.error('test')).toContain('test')
    })

    it('should handle all available theme names', () => {
      const themeNames: ThemeName[] = [
        'socket',
        'sunset',
        'terracotta',
        'lush',
        'ultra',
      ]
      for (const name of themeNames) {
        const theme = createInquirerTheme(name)
        expect(theme).toBeDefined()
        expect(theme.style).toBeDefined()
        expect(theme.icon).toBeDefined()
      }
    })

    it('should verify icon colors are applied', () => {
      const theme = createInquirerTheme('sunset')
      const icon = theme.icon as Record<string, string>
      expect(icon.checked).toBeDefined()
      expect(icon.unchecked).toBe(' ')
      expect(icon.cursor).toBeDefined()
    })
  })

  describe('isSocketTheme edge cases', () => {
    it('should handle theme without name', () => {
      const notATheme = {
        colors: { primary: 'blue' },
      }
      const theme = createInquirerTheme(notATheme)
      expect(theme).toBe(notATheme)
    })

    it('should handle theme without colors', () => {
      const notATheme = {
        name: 'test',
      }
      const theme = createInquirerTheme(notATheme)
      expect(theme).toBe(notATheme)
    })

    it('should handle empty object', () => {
      const emptyObj = {}
      const theme = createInquirerTheme(emptyObj)
      expect(theme).toBe(emptyObj)
    })

    it('should handle array input', () => {
      const arr = [1, 2, 3]
      const theme = createInquirerTheme(arr)
      expect(theme).toBe(arr)
    })

    it('should handle null input', () => {
      const theme = createInquirerTheme(null)
      expect(theme).toBe(null)
    })

    it('should handle undefined input', () => {
      const theme = createInquirerTheme(undefined)
      expect(theme).toBe(undefined)
    })

    it('should handle number input', () => {
      const theme = createInquirerTheme(42 as any)
      expect(theme).toBe(42)
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
        'extra arg' as any,
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

  describe('Choice type complex scenarios', () => {
    it('should handle choice with all optional fields undefined', () => {
      const choice: Choice<string> = {
        value: 'test',
        name: undefined,
        description: undefined,
        short: undefined,
        disabled: undefined,
      }
      expect(choice.value).toBe('test')
    })

    it('should handle choice with complex object value', () => {
      const complexValue = { id: 1, data: { nested: true } }
      const choice: Choice<typeof complexValue> = {
        value: complexValue,
        name: 'Complex Choice',
      }
      expect(choice.value).toBe(complexValue)
    })

    it('should handle choice with function value', () => {
      const fn = () => 'result'
      const choice: Choice<typeof fn> = {
        value: fn,
      }
      expect(typeof choice.value).toBe('function')
      expect(choice.value()).toBe('result')
    })
  })
})
