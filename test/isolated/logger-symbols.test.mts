/**
 * @file Isolated tests for the Logger module's LOG_SYMBOLS surface, internal
 *   symbol-keyed hooks, symbol stripping, blank-line tracking, and assorted
 *   edge cases. Split out of `logger.test.mts` to stay under the
 *   `socket/max-file-lines` cap. Shared harness lives in `logger-fixtures.ts`.
 */

import { describe, expect, it } from 'vitest'
import { Logger } from '../../src/logger/node'
import {
  LOG_SYMBOLS,
  incLogCallCountSymbol,
  lastWasBlankSymbol,
} from '../../src/logger/symbols'
// The aliased LOG_SYMBOLS is used to BUILD the expected value inside the
// matcher (`expect(actual).toEqual(canonicalLogSymbols)`), so it must come
// from the published surface rather than local `src/` (the isolated vitest
// config aliases `@socketsecurity/lib-stable` back to `src`).
import { LOG_SYMBOLS as canonicalLogSymbols } from '@socketsecurity/lib-stable/logger/symbols'
import { setTheme } from '@socketsecurity/lib/themes/context'
import { THEMES } from '@socketsecurity/lib/themes/themes'
import { setupLoggerHarness } from './logger-fixtures'

/**
 * Logger exposes two internal hooks as symbol-keyed methods. The tests reach
 * them by symbol; this type narrows the access so the calls stay type-safe
 * without an `any` cast.
 */
type LoggerInternals = {
  [incLogCallCountSymbol]: () => unknown
  [lastWasBlankSymbol]: (value: boolean) => unknown
}

describe('LOG_SYMBOLS', () => {
  it('should lazily initialize symbols', () => {
    expect(LOG_SYMBOLS).toBeDefined()
    expect(LOG_SYMBOLS['success']).toContain('')
    expect(LOG_SYMBOLS['fail']).toContain('')
    expect(LOG_SYMBOLS['warn']).toContain('')
    expect(LOG_SYMBOLS['info']).toContain('')
    expect(LOG_SYMBOLS['skip']).toContain('')
    expect(LOG_SYMBOLS['step']).toContain('')
  })

  it('should provide colored symbols', () => {
    // Access all symbols to ensure lazy initialization
    const { fail, info, skip, step, success, warn } = LOG_SYMBOLS
    expect(success).toBeTruthy()
    expect(fail).toBeTruthy()
    expect(warn).toBeTruthy()
    expect(info).toBeTruthy()
    expect(skip).toBeTruthy()
    expect(step).toBeTruthy()
  })

  it('should update symbols when theme changes', () => {
    // Initialize symbols with default theme
    const initialSuccess = LOG_SYMBOLS['success']
    expect(initialSuccess).toBeTruthy()

    // Change theme
    setTheme(THEMES.sunset)

    // Symbols should update
    const updatedSuccess = LOG_SYMBOLS['success']
    expect(updatedSuccess).toBeTruthy()

    // Reset to default theme for other tests
    setTheme(THEMES.socket)
  })

  it('should be accessible via Logger.LOG_SYMBOLS', () => {
    // canonicalLogSymbols here comes from the -stable alias (a separate module
    // instance from the local src that Logger uses) and is a Proxy, so
    // compare by value, not reference. Per-key strings are primitives, so
    // callers like Logger.LOG_SYMBOLS['success'] === canonicalLogSymbols['success']
    // still hold.
    expect(Logger.LOG_SYMBOLS).toEqual(canonicalLogSymbols)
  })
})

describe('Logger symbols and stripping', () => {
  const harness = setupLoggerHarness()

  describe('symbols', () => {
    it('should expose incLogCallCountSymbol', () => {
      expect(incLogCallCountSymbol).toBeDefined()
      expect(typeof incLogCallCountSymbol).toBe('symbol')
    })

    it('should expose lastWasBlankSymbol', () => {
      expect(lastWasBlankSymbol).toBeDefined()
      expect(typeof lastWasBlankSymbol).toBe('symbol')
    })

    it('should allow incrementing log count via symbol', () => {
      const before = harness.testLogger.logCallCount
      ;(harness.testLogger as unknown as LoggerInternals)[
        incLogCallCountSymbol
      ]()
      expect(harness.testLogger.logCallCount).toBe(before + 1)
    })

    it('should allow setting lastWasBlank via symbol', () => {
      ;(harness.testLogger as unknown as LoggerInternals)[lastWasBlankSymbol](
        true,
      )
      // Verify by checking logNewline behavior
      const before = harness.stdoutChunks.length
      harness.testLogger.logNewline()
      expect(harness.stdoutChunks.length).toBe(before) // Should not add line
    })
  })

  describe('method chaining', () => {
    it('should support chaining multiple operations', () => {
      const result = harness.testLogger
        .log('step 1')
        .indent()
        .log('step 2')
        .success('done')
        .dedent()
        .log('step 3')

      expect(result).toBe(harness.testLogger)
      const stdout = harness.stdoutChunks.join('')
      const stderr = harness.stderrChunks.join('')
      expect(stdout).toContain('step 1')
      expect(stdout).toContain('  step 2')
      expect(stderr).toContain('done')
      expect(stdout).toContain('step 3')
    })
  })

  describe('symbol stripping', () => {
    it('should strip unicode checkmark symbols', () => {
      harness.testLogger.success('✔ message')
      harness.testLogger.success('✓ message')
      harness.testLogger.success('√ message')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('message')
    })

    it('should strip unicode fail symbols', () => {
      harness.testLogger.fail('✖ message')
      harness.testLogger.fail('✗ message')
      harness.testLogger.fail('× message')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('message')
    })

    it('should strip unicode warn symbols', () => {
      harness.testLogger.warn('⚠ message')
      harness.testLogger.warn('‼ message')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('message')
    })

    it('should strip unicode info symbols', () => {
      harness.testLogger.info('ℹ message')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('message')
    })

    it('should strip variation selectors', () => {
      harness.testLogger.success('✔️ message')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('message')
    })

    it('should strip symbols with whitespace', () => {
      harness.testLogger.success('✔  message with spaces')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('message with spaces')
    })
  })

  describe.sequential('blank line tracking', () => {
    it('should track when last line was blank', () => {
      harness.testLogger.log('')
      harness.testLogger.logNewline()
      // Should not add duplicate blank line
      expect(harness.stdoutChunks.length).toBe(1)
    })

    it('should track blank lines for stderr', () => {
      harness.testLogger.error('')
      harness.testLogger.errorNewline()
      // Should not add duplicate blank line
      expect(harness.stderrChunks.length).toBe(1)
    })

    it('should reset blank tracking after non-blank log', () => {
      harness.testLogger.log('')
      harness.testLogger.log('text')
      harness.testLogger.logNewline()
      // Should add blank line after non-blank
      expect(harness.stdoutChunks.length).toBe(3)
    })
  })

  describe.sequential('edge cases', () => {
    it('should handle empty strings', () => {
      harness.testLogger.log('')
      harness.testLogger.error('')
      expect(harness.stdoutChunks.length).toBe(1)
      expect(harness.stderrChunks.length).toBe(1)
    })

    it('should handle special characters', () => {
      harness.testLogger.log('Tab\there')
      harness.testLogger.log('Newline\nhere')
      harness.testLogger.log('Unicode: 🚀')
      expect(harness.stdoutChunks.length).toBe(3)
    })

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(10_000)
      harness.testLogger.log(longString)
      expect(harness.stdoutChunks.join('')).toContain(longString)
    })

    it('should handle null and undefined', () => {
      harness.testLogger.log(undefined)
      harness.testLogger.log(undefined)
      expect(harness.stdoutChunks.length).toBe(2)
    })

    it('should handle objects with circular references', () => {
      const obj: { name: string; self?: unknown | undefined } = {
        name: 'test',
      }
      obj.self = obj
      expect(() => {
        harness.testLogger.dir(obj)
      }).not.toThrow()
    })

    it('should handle nested indentation', () => {
      harness.testLogger.indent()
      harness.testLogger.log('level 1')
      harness.testLogger.indent()
      harness.testLogger.log('level 2')
      harness.testLogger.indent()
      harness.testLogger.log('level 3')
      harness.testLogger.dedent()
      harness.testLogger.dedent()
      harness.testLogger.dedent()
      harness.testLogger.log('level 0')
      const output = harness.stdoutChunks.join('')
      expect(output).toContain('  level 1')
      expect(output).toContain('    level 2')
      expect(output).toContain('      level 3')
    })
  })

  describe('skip() method', () => {
    it('should log skip message with symbol', () => {
      harness.testLogger.skip('Test skipped')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('Test skipped')
    })

    it('should support multiple arguments', () => {
      harness.testLogger.skip('Skipped', 5, 'tests')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('Skipped')
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.skip('skipping step')
      expect(result).toBe(harness.testLogger)
    })

    it('should handle empty skip message', () => {
      harness.testLogger.skip()
      expect(harness.stderrChunks.length).toBeGreaterThan(0)
    })

    it('should strip existing symbols', () => {
      harness.testLogger.skip('↻ already has symbol')
      const output = harness.stderrChunks.join('')
      expect(output).toContain('already has symbol')
    })

    it('should output to stderr', () => {
      const beforeStderr = harness.stderrChunks.length
      const beforeStdout = harness.stdoutChunks.length
      harness.testLogger.skip('skip message')
      expect(harness.stderrChunks.length).toBe(beforeStderr + 1)
      expect(harness.stdoutChunks.length).toBe(beforeStdout)
    })
  })

  describe('time() method', () => {
    it('should start a timer with a label', () => {
      expect(() => {
        harness.testLogger.time('test-timer')
      }).not.toThrow()
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.time('chain-timer')
      expect(result).toBe(harness.testLogger)
    })

    it('should handle timer without label', () => {
      expect(() => {
        harness.testLogger.time()
      }).not.toThrow()
    })

    it('should work with timeEnd', () => {
      harness.testLogger.time('duration-timer')
      expect(() => {
        harness.testLogger.timeEnd('duration-timer')
      }).not.toThrow()
      const output = harness.stdoutChunks.join('')
      expect(output).toContain('duration-timer')
    })

    it('should work with timeLog', () => {
      harness.testLogger.time('log-timer')
      expect(() => {
        harness.testLogger.timeLog('log-timer', 'checkpoint')
      }).not.toThrow()
      const output = harness.stdoutChunks.join('')
      expect(output).toContain('log-timer')
    })

    it('should handle multiple concurrent timers', () => {
      harness.testLogger.time('timer-1')
      harness.testLogger.time('timer-2')
      harness.testLogger.time('timer-3')
      expect(() => {
        harness.testLogger.timeEnd('timer-1')
        harness.testLogger.timeEnd('timer-2')
        harness.testLogger.timeEnd('timer-3')
      }).not.toThrow()
    })
  })

  describe('console methods proxy', () => {
    it('should have Symbol.toStringTag', () => {
      expect(Object.prototype.toString.call(harness.testLogger)).toBe(
        '[object logger]',
      )
    })

    it('should support timeEnd without errors', () => {
      harness.testLogger.time('any-timer')
      expect(() => {
        harness.testLogger.timeEnd('any-timer')
      }).not.toThrow()
    })
  })

  describe('constructor with different argument types', () => {
    it('should handle object constructor args', () => {
      const customLogger = new Logger({
        stdout: harness.mockStdout,
        stderr: harness.mockStderr,
      })
      expect(customLogger).toBeInstanceOf(Logger)
    })

    it('should create logger without args', () => {
      const defaultLogger = new Logger()
      expect(defaultLogger).toBeInstanceOf(Logger)
    })
  })
})
