/**
 * @file Isolated tests for the Logger class's core logging surface: every
 *   logging level (log, info, warn, error, success, fail, done), indentation,
 *   grouping, newline/blank-line helpers, assertions, the stream-bound
 *   getters, and the logCallCount tracker. The data/timing/stream-control
 *   methods live in `logger-methods.test.mts`; the LOG_SYMBOLS surface,
 *   internal symbol hooks, and assorted edge cases live in
 *   `logger-symbols.test.mts`. The split keeps each file under the
 *   `socket/max-file-lines` cap; shared capture-stream plumbing is in
 *   `logger-fixtures.ts`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Logger } from '../../src/logger/node'
import { createCaptureStream } from './logger-fixtures'
import type { MockStream } from './logger-fixtures'

describe('Logger', () => {
  let testLogger: Logger
  let stdoutChunks: string[]
  let stderrChunks: string[]
  let mockStdout: MockStream
  let mockStderr: MockStream

  beforeEach(() => {
    stdoutChunks = []
    stderrChunks = []

    mockStdout = createCaptureStream(stdoutChunks)
    mockStdout.isTTY = false

    mockStderr = createCaptureStream(stderrChunks)
    mockStderr.isTTY = false

    testLogger = new Logger({ stdout: mockStdout, stderr: mockStderr })
  })

  afterEach(() => {
    stdoutChunks = []
    stderrChunks = []
  })

  describe('constructor', () => {
    it('should create a logger with default streams when no args provided', () => {
      const defaultLogger = new Logger()
      expect(defaultLogger).toBeInstanceOf(Logger)
    })

    it('should create a logger with custom streams', () => {
      expect(testLogger).toBeInstanceOf(Logger)
    })

    it('should store options from constructor', () => {
      const customOptions = { stdout: mockStdout, stderr: mockStderr }
      const customLogger = new Logger(customOptions)
      expect(customLogger).toBeInstanceOf(Logger)
    })
  })

  describe('log() method', () => {
    it('should log a message to stdout', () => {
      testLogger.log('test message')
      expect(stdoutChunks.join('')).toContain('test message')
    })

    it('should support multiple arguments', () => {
      testLogger.log('message', 123, { key: 'value' })
      const output = stdoutChunks.join('')
      expect(output).toContain('message')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.log('test')
      expect(result).toBe(testLogger)
    })

    it('should track log call count', () => {
      const initialCount = testLogger.logCallCount
      testLogger.log('test')
      expect(testLogger.logCallCount).toBe(initialCount + 1)
    })

    it('should handle non-string arguments', () => {
      testLogger.log(123)
      testLogger.log({ key: 'value' })
      testLogger.log(undefined)
      testLogger.log(undefined)
      expect(stdoutChunks.length).toBeGreaterThan(0)
    })
  })

  describe('error() method', () => {
    it('should log error to stderr', () => {
      testLogger.error('error message')
      expect(stderrChunks.join('')).toContain('error message')
    })

    it('should support multiple arguments', () => {
      testLogger.error('error', 500, { code: 'ERR' })
      const output = stderrChunks.join('')
      expect(output).toContain('error')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.error('error')
      expect(result).toBe(testLogger)
    })
  })

  describe('success() method', () => {
    it('should log success message with symbol', () => {
      testLogger.success('operation succeeded')
      const output = stderrChunks.join('')
      expect(output).toContain('operation succeeded')
    })

    it('should strip existing symbols from message', () => {
      testLogger.success('✔ already has symbol')
      const output = stderrChunks.join('')
      expect(output).toContain('already has symbol')
    })

    it('should handle non-string arguments', () => {
      testLogger.success()
      testLogger.success(123)
      expect(stderrChunks.length).toBeGreaterThan(0)
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.success('done')
      expect(result).toBe(testLogger)
    })
  })

  describe('fail() method', () => {
    it('should log fail message with symbol', () => {
      testLogger.fail('operation failed')
      const output = stderrChunks.join('')
      expect(output).toContain('operation failed')
    })

    it('should strip existing symbols', () => {
      testLogger.fail('✖ has fail symbol')
      const output = stderrChunks.join('')
      expect(output).toContain('has fail symbol')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.fail('error')
      expect(result).toBe(testLogger)
    })
  })

  describe('warn() method', () => {
    it('should log warning message with symbol', () => {
      testLogger.warn('warning message')
      const output = stderrChunks.join('')
      expect(output).toContain('warning message')
    })

    it('should strip existing warning symbols', () => {
      testLogger.warn('⚠ existing warning')
      const output = stderrChunks.join('')
      expect(output).toContain('existing warning')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.warn('warning')
      expect(result).toBe(testLogger)
    })
  })

  describe('info() method', () => {
    it('should log info message with symbol', () => {
      testLogger.info('info message')
      const output = stderrChunks.join('')
      expect(output).toContain('info message')
    })

    it('should strip existing info symbols', () => {
      testLogger.info('ℹ existing info')
      const output = stderrChunks.join('')
      expect(output).toContain('existing info')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.info('info')
      expect(result).toBe(testLogger)
    })
  })

  describe('done() method', () => {
    it('should be an alias for success()', () => {
      testLogger.done('completed')
      const output = stderrChunks.join('')
      expect(output).toContain('completed')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.done('done')
      expect(result).toBe(testLogger)
    })
  })

  describe('indent() and dedent() methods', () => {
    it('should indent messages by default 2 spaces', () => {
      testLogger.indent()
      testLogger.log('indented')
      const output = stdoutChunks.join('')
      expect(output).toContain('  indented')
    })

    it('should support custom indentation amounts', () => {
      testLogger.indent(4)
      testLogger.log('four spaces')
      const output = stdoutChunks.join('')
      expect(output).toContain('    four spaces')
    })

    it('should dedent by default 2 spaces', () => {
      testLogger.indent().indent()
      testLogger.log('4 spaces')
      testLogger.dedent()
      testLogger.log('2 spaces')
      const outputs = stdoutChunks.join('')
      expect(outputs).toContain('    4 spaces')
      expect(outputs).toContain('  2 spaces')
    })

    it('should support custom dedent amounts', () => {
      testLogger.indent(4)
      testLogger.log('indented')
      testLogger.dedent(4)
      testLogger.log('no indent')
      const outputs = stdoutChunks.join('')
      expect(outputs).toContain('    indented')
      expect(outputs).toContain('no indent')
    })

    it('should cap indentation at max (1000 spaces)', () => {
      testLogger.indent(2000)
      testLogger.log('max indent')
      const output = stdoutChunks.join('')
      const leadingSpaces = output.match(/^\s+/)?.[0].length || 0
      expect(leadingSpaces).toBeLessThanOrEqual(1000)
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.indent().dedent()
      expect(result).toBe(testLogger)
    })
  })

  describe('resetIndent() method', () => {
    it('should reset all indentation to zero', () => {
      testLogger.indent().indent().indent()
      testLogger.resetIndent()
      testLogger.log('no indent')
      const output = stdoutChunks.join('')
      expect(output.trim()).toContain('no indent')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.resetIndent()
      expect(result).toBe(testLogger)
    })
  })

  describe('group() and groupEnd() methods', () => {
    it('should create a group with label', () => {
      testLogger.group('Group Label')
      testLogger.log('inside group')
      testLogger.groupEnd()
      const output = stdoutChunks.join('')
      expect(output).toContain('Group Label')
      expect(output).toContain('inside group')
    })

    it('should indent content inside group', () => {
      testLogger.group('Group')
      testLogger.log('indented content')
      testLogger.groupEnd()
      testLogger.log('not indented')
      const output = stdoutChunks.join('')
      expect(output).toContain('  indented content')
    })

    it('should support nested groups', () => {
      testLogger.group('Outer')
      testLogger.log('outer content')
      testLogger.group('Inner')
      testLogger.log('inner content')
      testLogger.groupEnd()
      testLogger.groupEnd()
      const output = stdoutChunks.join('')
      expect(output).toContain('  outer content')
      expect(output).toContain('    inner content')
    })

    it('should work without label', () => {
      testLogger.group()
      testLogger.log('content')
      testLogger.groupEnd()
      const output = stdoutChunks.join('')
      expect(output).toContain('  content')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.group().groupEnd()
      expect(result).toBe(testLogger)
    })
  })

  describe('groupCollapsed() method', () => {
    it('should work like group()', () => {
      testLogger.groupCollapsed('Collapsed')
      testLogger.log('content')
      testLogger.groupEnd()
      const output = stdoutChunks.join('')
      expect(output).toContain('Collapsed')
      expect(output).toContain('  content')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.groupCollapsed('test')
      expect(result).toBe(testLogger)
    })
  })

  describe('step() method', () => {
    it('should add blank line before step', () => {
      testLogger.log('previous')
      testLogger.step('Step 1')
      const outputs = stdoutChunks
      expect(outputs.length).toBeGreaterThan(2)
    })

    it('should not add blank line if already blank', () => {
      testLogger.log('')
      const beforeCount = stdoutChunks.length
      testLogger.step('Step')
      // Should not add another blank line
      expect(stdoutChunks.length).toBe(beforeCount + 1)
    })

    it('should include arrow symbol in step message', () => {
      testLogger.step('Step 1')
      const output = stdoutChunks.join('')
      // Check for either Unicode → or ASCII > fallback
      expect(output).toMatch(/[→>]/)
      expect(output).toContain('Step 1')
    })

    it('should strip existing symbols from step message', () => {
      testLogger.step('→ Step 1')
      // Get the last chunk (the actual step line, not the blank line)
      const stepLine = stdoutChunks[stdoutChunks.length - 1]
      // Strip ANSI color codes for easier testing
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence needed for stripping color codes
      const stripped = stepLine!.replace(/\x1b\[\d+m/g, '')
      // Should have exactly one arrow symbol and the message text
      expect(stripped).toMatch(/^[→>] Step 1\n$/)
      // Verify the arrow appears exactly once at the start
      const arrowCount = (stripped.match(/[→>]/g) || []).length
      expect(arrowCount).toBe(1)
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.step('step')
      expect(result).toBe(testLogger)
    })
  })

  describe('substep() method', () => {
    it('should indent message by 2 spaces', () => {
      testLogger.substep('Substep')
      const output = stdoutChunks.join('')
      expect(output).toContain('  Substep')
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.substep('substep')
      expect(result).toBe(testLogger)
    })
  })

  describe('logNewline() method', () => {
    it('should add blank line if last was not blank', () => {
      testLogger.log('text')
      const beforeCount = stdoutChunks.length
      testLogger.logNewline()
      expect(stdoutChunks.length).toBe(beforeCount + 1)
    })

    it('should not add blank line if last was already blank', () => {
      testLogger.log('')
      const beforeCount = stdoutChunks.length
      testLogger.logNewline()
      expect(stdoutChunks.length).toBe(beforeCount)
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.logNewline()
      expect(result).toBe(testLogger)
    })
  })

  describe('errorNewline() method', () => {
    it('should add blank line to stderr if last was not blank', () => {
      testLogger.error('error')
      const beforeCount = stderrChunks.length
      testLogger.errorNewline()
      expect(stderrChunks.length).toBe(beforeCount + 1)
    })

    it('should not add blank line if last was already blank', () => {
      testLogger.error('')
      const beforeCount = stderrChunks.length
      testLogger.errorNewline()
      expect(stderrChunks.length).toBe(beforeCount)
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.errorNewline()
      expect(result).toBe(testLogger)
    })
  })

  describe('assert() method', () => {
    it('should not log when assertion is truthy', () => {
      const beforeLogCount = testLogger.logCallCount
      testLogger.assert(true, 'should not appear')
      // assert() doesn't increment log count for successful assertions
      expect(testLogger.logCallCount).toBe(beforeLogCount)
    })

    it('should log when assertion is falsy', () => {
      const beforeLogCount = testLogger.logCallCount
      testLogger.assert(false, 'assertion failed')
      // assert() increments log count for failed assertions
      expect(testLogger.logCallCount).toBe(beforeLogCount + 1)
    })

    it('should increment log count only on failure', () => {
      const beforeCount = testLogger.logCallCount
      testLogger.assert(true, 'pass')
      expect(testLogger.logCallCount).toBe(beforeCount)
      testLogger.assert(false, 'fail')
      expect(testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      const result = testLogger.assert(true, 'test')
      expect(result).toBe(testLogger)
    })
  })

})
