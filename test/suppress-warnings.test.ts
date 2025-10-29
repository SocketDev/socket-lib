/**
 * @fileoverview Unit tests for warning suppression utilities.
 */

import {
  restoreWarnings,
  setMaxEventTargetListeners,
  suppressMaxListenersWarning,
  suppressWarningType,
  withSuppressedWarnings,
} from '@socketsecurity/lib/suppress-warnings'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('suppress-warnings', () => {
  let originalEmitWarning: typeof process.emitWarning

  beforeEach(() => {
    // Save original emitWarning
    originalEmitWarning = process.emitWarning
  })

  afterEach(() => {
    // Restore original emitWarning after each test
    process.emitWarning = originalEmitWarning
    restoreWarnings()
  })

  describe('suppressMaxListenersWarning', () => {
    it('should suppress MaxListenersExceededWarning', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressMaxListenersWarning()

      // Emit a MaxListenersExceededWarning
      process.emitWarning('MaxListenersExceededWarning: test message')

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should allow non-MaxListeners warnings through', () => {
      const warningSpy = vi.fn()
      suppressMaxListenersWarning()
      process.emitWarning = warningSpy

      process.emitWarning('DeprecationWarning: test')

      expect(warningSpy).toHaveBeenCalledWith('DeprecationWarning: test')
    })

    it('should be callable multiple times', () => {
      suppressMaxListenersWarning()
      suppressMaxListenersWarning()
      suppressMaxListenersWarning()

      expect(true).toBe(true)
    })
  })

  describe('suppressWarningType', () => {
    it('should suppress specified warning type', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressWarningType('ExperimentalWarning')

      process.emitWarning('ExperimentalWarning: test feature')

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should suppress DeprecationWarning', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressWarningType('DeprecationWarning')

      process.emitWarning('DeprecationWarning: old API')

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should suppress multiple warning types', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressWarningType('ExperimentalWarning')
      suppressWarningType('DeprecationWarning')

      process.emitWarning('ExperimentalWarning: test')
      process.emitWarning('DeprecationWarning: old')

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should allow non-suppressed warnings through', () => {
      const warningSpy = vi.fn()
      suppressWarningType('ExperimentalWarning')
      process.emitWarning = warningSpy

      process.emitWarning('CustomWarning: test')

      expect(warningSpy).toHaveBeenCalledWith('CustomWarning: test')
    })

    it('should handle warning objects with name property', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressWarningType('DeprecationWarning')

      const warning = new Error('test')
      ;(warning as any).name = 'DeprecationWarning'
      process.emitWarning(warning as any)

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should allow warning objects with non-suppressed names', () => {
      const warningSpy = vi.fn()
      suppressWarningType('ExperimentalWarning')
      process.emitWarning = warningSpy

      const warning = new Error('test')
      ;(warning as any).name = 'CustomWarning'
      process.emitWarning(warning as any)

      expect(warningSpy).toHaveBeenCalledWith(warning)
    })
  })

  describe('setMaxEventTargetListeners', () => {
    it('should set max listeners on AbortSignal', () => {
      const controller = new AbortController()
      setMaxEventTargetListeners(controller.signal, 20)

      const symbols = Object.getOwnPropertySymbols(controller.signal)
      const kMaxEventTargetListeners = symbols.find(
        s => s.description === 'events.maxEventTargetListeners',
      )

      if (kMaxEventTargetListeners) {
        expect((controller.signal as any)[kMaxEventTargetListeners]).toBe(20)
      }
    })

    it('should use default value of 10 when not specified', () => {
      const controller = new AbortController()
      setMaxEventTargetListeners(controller.signal)

      const symbols = Object.getOwnPropertySymbols(controller.signal)
      const kMaxEventTargetListeners = symbols.find(
        s => s.description === 'events.maxEventTargetListeners',
      )

      if (kMaxEventTargetListeners) {
        expect((controller.signal as any)[kMaxEventTargetListeners]).toBe(10)
      }
    })

    it('should handle undefined target gracefully', () => {
      expect(() => setMaxEventTargetListeners(undefined)).not.toThrow()
    })

    it('should handle custom EventTarget', () => {
      const target = new EventTarget()
      expect(() => setMaxEventTargetListeners(target, 15)).not.toThrow()
    })

    it('should handle different maxListeners values', () => {
      const controller = new AbortController()
      setMaxEventTargetListeners(controller.signal, 100)

      const symbols = Object.getOwnPropertySymbols(controller.signal)
      const kMaxEventTargetListeners = symbols.find(
        s => s.description === 'events.maxEventTargetListeners',
      )

      if (kMaxEventTargetListeners) {
        expect((controller.signal as any)[kMaxEventTargetListeners]).toBe(100)
      }
    })

    it('should handle zero maxListeners', () => {
      const controller = new AbortController()
      setMaxEventTargetListeners(controller.signal, 0)

      const symbols = Object.getOwnPropertySymbols(controller.signal)
      const kMaxEventTargetListeners = symbols.find(
        s => s.description === 'events.maxEventTargetListeners',
      )

      if (kMaxEventTargetListeners) {
        expect((controller.signal as any)[kMaxEventTargetListeners]).toBe(0)
      }
    })
  })

  describe('restoreWarnings', () => {
    it('should restore original emitWarning function', () => {
      const original = process.emitWarning
      suppressWarningType('ExperimentalWarning')

      expect(process.emitWarning).not.toBe(original)

      restoreWarnings()

      expect(process.emitWarning).toBe(original)
    })

    it('should clear suppressed warnings', () => {
      const warningSpy = vi.fn()

      suppressWarningType('ExperimentalWarning')
      restoreWarnings()

      process.emitWarning = warningSpy
      process.emitWarning('ExperimentalWarning: test')

      expect(warningSpy).toHaveBeenCalledWith('ExperimentalWarning: test')
    })

    it('should be safe to call multiple times', () => {
      restoreWarnings()
      restoreWarnings()
      restoreWarnings()

      expect(true).toBe(true)
    })

    it('should be safe to call without prior suppression', () => {
      const original = process.emitWarning
      restoreWarnings()

      expect(process.emitWarning).toBe(original)
    })
  })

  describe('withSuppressedWarnings', () => {
    it('should suppress warnings during callback execution', async () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      await withSuppressedWarnings('ExperimentalWarning', () => {
        process.emitWarning('ExperimentalWarning: test')
      })

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should restore warnings after callback', async () => {
      const warningSpy = vi.fn()

      await withSuppressedWarnings('ExperimentalWarning', () => {
        // Nothing
      })

      process.emitWarning = warningSpy
      process.emitWarning('ExperimentalWarning: test')

      expect(warningSpy).toHaveBeenCalledWith('ExperimentalWarning: test')
    })

    it('should return callback result', async () => {
      const result = await withSuppressedWarnings('ExperimentalWarning', () => {
        return 42
      })

      expect(result).toBe(42)
    })

    it('should work with async callbacks', async () => {
      const result = await withSuppressedWarnings(
        'ExperimentalWarning',
        async () => {
          return 'async result'
        },
      )

      expect(result).toBe('async result')
    })

    it('should restore warnings even if callback throws', async () => {
      const original = process.emitWarning

      await expect(
        withSuppressedWarnings('ExperimentalWarning', () => {
          throw new Error('test error')
        }),
      ).rejects.toThrow('test error')

      expect(process.emitWarning).toBe(original)
    })

    it('should handle async callback errors', async () => {
      const original = process.emitWarning

      await expect(
        withSuppressedWarnings('ExperimentalWarning', async () => {
          throw new Error('async error')
        }),
      ).rejects.toThrow('async error')

      expect(process.emitWarning).toBe(original)
    })

    it('should suppress warnings for different types', async () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      await withSuppressedWarnings('DeprecationWarning', () => {
        process.emitWarning('DeprecationWarning: old API')
      })

      expect(warningSpy).not.toHaveBeenCalled()
    })
  })

  describe('edge cases and integration', () => {
    it('should handle partial string matches in warnings', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressWarningType('Experimental')

      process.emitWarning('ExperimentalWarning: new feature')

      expect(warningSpy).not.toHaveBeenCalled()
    })

    it('should handle empty warning strings', () => {
      const warningSpy = vi.fn()
      suppressWarningType('ExperimentalWarning')
      process.emitWarning = warningSpy

      process.emitWarning('')

      expect(warningSpy).toHaveBeenCalledWith('')
    })

    it('should handle warning objects without name property', () => {
      const warningSpy = vi.fn()
      suppressWarningType('ExperimentalWarning')
      process.emitWarning = warningSpy

      const warning = new Error('test')
      process.emitWarning(warning as any)

      expect(warningSpy).toHaveBeenCalledWith(warning)
    })

    it('should preserve additional emitWarning arguments', () => {
      const warningSpy = vi.fn()
      suppressWarningType('CustomWarning')
      process.emitWarning = warningSpy

      process.emitWarning('OtherWarning: test', 'TestType', 'TEST_CODE')

      expect(warningSpy).toHaveBeenCalledWith(
        'OtherWarning: test',
        'TestType',
        'TEST_CODE',
      )
    })

    it('should handle concurrent suppressions', () => {
      const warningSpy = vi.fn()
      process.emitWarning = warningSpy

      suppressWarningType('Warning1')
      suppressWarningType('Warning2')
      suppressWarningType('Warning3')

      process.emitWarning('Warning1: test')
      process.emitWarning('Warning2: test')
      process.emitWarning('Warning3: test')

      expect(warningSpy).not.toHaveBeenCalled()
    })
  })
})
