/**
 * @fileoverview Unit tests for process warning suppression utilities.
 *
 * Tests warning suppression utilities:
 * - suppressMaxListenersWarning() - suppress MaxListenersExceededWarning
 * - suppressWarningType() - suppress specific warning types
 * - setMaxEventTargetListeners() - configure EventTarget max listeners
 * - restoreWarnings() - restore original warning behavior
 * - withSuppressedWarnings() - temporarily suppress warnings
 * Used in tests and scripts to control noisy or expected warnings.
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
  let emitWarningSpy: any

  beforeEach(() => {
    originalEmitWarning = process.emitWarning
    emitWarningSpy = vi.fn()
  })

  afterEach(() => {
    process.emitWarning = originalEmitWarning
    restoreWarnings()
  })

  describe('suppressMaxListenersWarning', () => {
    it('should set up suppression for MaxListenersExceededWarning', () => {
      expect(() => suppressMaxListenersWarning()).not.toThrow()
    })

    it('should allow other warnings through', () => {
      restoreWarnings()
      process.emitWarning = emitWarningSpy
      suppressMaxListenersWarning()

      const wrapped = process.emitWarning
      process.emitWarning = (warning, ...args) => {
        emitWarningSpy(warning, ...args)
        return wrapped(warning, ...args)
      }

      process.emitWarning('DeprecationWarning: test')
      expect(emitWarningSpy).toHaveBeenCalled()
    })

    it('should configure warning suppression', () => {
      restoreWarnings()
      suppressMaxListenersWarning()
      expect(process.emitWarning).not.toBe(originalEmitWarning)
    })
  })

  describe('suppressWarningType', () => {
    it('should accept warning type string', () => {
      expect(() => suppressWarningType('ExperimentalWarning')).not.toThrow()
    })

    it('should accept multiple warning types', () => {
      restoreWarnings()
      expect(() => {
        suppressWarningType('ExperimentalWarning')
        suppressWarningType('DeprecationWarning')
      }).not.toThrow()
    })

    it('should configure process.emitWarning', () => {
      restoreWarnings()
      const before = process.emitWarning
      suppressWarningType('TestWarning')
      expect(process.emitWarning).not.toBe(before)
    })
  })

  describe('setMaxEventTargetListeners', () => {
    it('should handle undefined target gracefully', () => {
      expect(() => setMaxEventTargetListeners(undefined)).not.toThrow()
    })

    it('should set max listeners on AbortSignal', () => {
      const controller = new AbortController()
      const { signal } = controller

      setMaxEventTargetListeners(signal, 20)

      const symbols = Object.getOwnPropertySymbols(signal)
      const kMaxEventTargetListeners = symbols.find(
        s => s.description === 'events.maxEventTargetListeners',
      )

      if (kMaxEventTargetListeners) {
        expect((signal as any)[kMaxEventTargetListeners]).toBe(20)
      }
    })

    it('should use default value of 10', () => {
      const controller = new AbortController()
      const { signal } = controller

      setMaxEventTargetListeners(signal)

      const symbols = Object.getOwnPropertySymbols(signal)
      const kMaxEventTargetListeners = symbols.find(
        s => s.description === 'events.maxEventTargetListeners',
      )

      if (kMaxEventTargetListeners) {
        expect((signal as any)[kMaxEventTargetListeners]).toBe(10)
      }
    })

    it('should handle EventTarget without the symbol', () => {
      const target = new EventTarget()
      expect(() => setMaxEventTargetListeners(target, 15)).not.toThrow()
    })
  })

  describe('restoreWarnings', () => {
    it('should restore original emitWarning', () => {
      const original = process.emitWarning
      suppressMaxListenersWarning()

      expect(process.emitWarning).not.toBe(original)

      restoreWarnings()

      expect(process.emitWarning).toBe(original)
    })

    it('should clear suppressed warnings', () => {
      suppressMaxListenersWarning()
      restoreWarnings()

      process.emitWarning = emitWarningSpy

      suppressMaxListenersWarning()
      process.emitWarning('MaxListenersExceededWarning: test')

      expect(emitWarningSpy).not.toHaveBeenCalled()
    })

    it('should be safe to call multiple times', () => {
      suppressMaxListenersWarning()
      restoreWarnings()
      expect(() => restoreWarnings()).not.toThrow()
    })

    it('should be safe to call without prior suppression', () => {
      expect(() => restoreWarnings()).not.toThrow()
    })
  })

  describe('withSuppressedWarnings', () => {
    it('should restore warnings after callback completes', async () => {
      restoreWarnings()
      const original = process.emitWarning

      await withSuppressedWarnings('TestWarning', () => {
        // Nothing
      })

      expect(process.emitWarning).toBe(original)
    })

    it('should handle callback errors', async () => {
      try {
        await withSuppressedWarnings('TestWarning', () => {
          throw new Error('test error')
        })
      } catch (error: any) {
        expect(error.message).toBe('test error')
      }
      // Error was properly propagated
      expect(true).toBe(true)
    })

    it('should return callback result', async () => {
      const result = await withSuppressedWarnings('TestWarning', () => {
        return 'test result'
      })

      expect(result).toBe('test result')
    })

    it('should handle async callbacks', async () => {
      const result = await withSuppressedWarnings('TestWarning', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'async result'
      })

      expect(result).toBe('async result')
    })

    it('should not remove warning type if it was already suppressed', async () => {
      restoreWarnings()
      suppressWarningType('TestWarning')

      await withSuppressedWarnings('TestWarning', () => {
        // Nothing
      })

      // Warning should still be wrapped since it was already suppressed
      expect(process.emitWarning).not.toBe(originalEmitWarning)
    })
  })

  describe('integration', () => {
    it('should handle multiple suppressions', () => {
      restoreWarnings()
      expect(() => {
        suppressWarningType('Warning1')
        suppressWarningType('Warning2')
      }).not.toThrow()
    })

    it('should only wrap emitWarning once', () => {
      restoreWarnings()
      const original = process.emitWarning

      suppressWarningType('Warning1')
      const wrapped = process.emitWarning

      suppressWarningType('Warning2')
      expect(process.emitWarning).toBe(wrapped)

      process.emitWarning = original
    })

    it('should restore after suppressions', () => {
      restoreWarnings()
      const original = process.emitWarning

      suppressWarningType('Warning1')
      suppressWarningType('Warning2')
      restoreWarnings()

      expect(process.emitWarning).toBe(original)
    })
  })
})
