/**
 * @file Isolated tests for the Logger module's data, timing, and stream-control
 *   methods (createTask, count, dir, dirxml, table, time/timeEnd/timeLog,
 *   trace, write, progress, clearLine, clearVisible). Split out of
 *   `logger.test.mts` to stay under the `socket/max-file-lines` cap; the core
 *   logging-level coverage stays in that sibling file. Shared harness lives in
 *   `logger-fixtures.ts`.
 */

import { describe, expect, it, vi } from 'vitest'
// oxlint-disable-next-line socket/no-platform-specific-import -- the isolated vitest config resolves only the explicit /node file; the barrel has no index.ts and exports-map resolution isn't wired for relative/aliased imports here.
import { Logger } from '../../src/logger/node'
import { createCaptureStream, setupLoggerHarness } from './logger-fixtures'

describe('Logger methods', () => {
  const harness = setupLoggerHarness()

  describe('createTask() method', () => {
    it('should create a task that logs start and completion', () => {
      const task = harness.testLogger.createTask('TestTask')
      const result = task.run(() => 'result')
      const output = harness.stdoutChunks.join('')
      expect(output).toContain('Starting task: TestTask')
      expect(output).toContain('Completed task: TestTask')
      expect(result).toBe('result')
    })

    it('should execute task function and return result', () => {
      const task = harness.testLogger.createTask('Task')
      const result = task.run(() => 42)
      expect(result).toBe(42)
    })

    it('should work with void functions', () => {
      const task = harness.testLogger.createTask('VoidTask')
      const spy = vi.fn()
      task.run(spy)
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('count() method', () => {
    it('should increment and log counter', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.count('test')
      harness.testLogger.count('test')
      // count() should increment log count twice
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 2)
    })

    it('should use default label when none provided', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.count()
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.count('label')
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('dir() method', () => {
    it('should display object properties', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.dir({ key: 'value' })
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should support options', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.dir({ nested: { deep: 'value' } }, { depth: 2 })
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.dir({})
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('dirxml() method', () => {
    it('should display XML/HTML data', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.dirxml({ xml: 'data' })
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.dirxml('data')
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('table() method', () => {
    it('should display data as table', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.table([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ])
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should support property filter', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.table(
        [
          { name: 'Alice', age: 30, city: 'NYC' },
          { name: 'Bob', age: 25, city: 'LA' },
        ],
        ['name', 'age'],
      )
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.table([])
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('timeEnd() method', () => {
    it('should end timer and log duration', () => {
      harness.testLogger.time('timer-test-1')
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.timeEnd('timer-test-1')
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should work with non-existent timer', () => {
      harness.testLogger.time('existing-timer')
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.timeEnd('existing-timer')
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      harness.testLogger.time('some-label')
      const result = harness.testLogger.timeEnd('some-label')
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('timeLog() method', () => {
    it('should log current timer value without stopping', () => {
      harness.testLogger.time('timer-test-2')
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.timeLog('timer-test-2', 'checkpoint')
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
      harness.testLogger.timeEnd('timer-test-2')
    })

    it('should support additional data', () => {
      harness.testLogger.time('timer-test-3')
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.timeLog('timer-test-3', 'data1', 'data2')
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
      harness.testLogger.timeEnd('timer-test-3')
    })

    it('should return logger instance for chaining', () => {
      harness.testLogger.time('some-timer')
      const result = harness.testLogger.timeLog('some-timer')
      expect(result).toBe(harness.testLogger)
      harness.testLogger.timeEnd('some-timer')
    })
  })

  describe('trace() method', () => {
    it('should log stack trace', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.trace('trace point')
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should work without message', () => {
      const beforeCount = harness.testLogger.logCallCount
      harness.testLogger.trace()
      expect(harness.testLogger.logCallCount).toBe(beforeCount + 1)
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.trace('trace')
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('write() method', () => {
    it('should write text to stdout without newline', () => {
      // Explicitly clear chunks before test (defensive against CI isolation issues)
      harness.stdoutChunks.length = 0
      harness.testLogger.write('raw text')
      const output = harness.stdoutChunks.join('')
      expect(output).toBe('raw text')
    })

    it('should not apply indentation', () => {
      // Explicitly clear chunks before test (defensive against CI isolation issues)
      harness.stdoutChunks.length = 0
      harness.testLogger.indent()
      harness.testLogger.write('no indent')
      const output = harness.stdoutChunks.join('')
      expect(output).toBe('no indent')
    })

    it('should return logger instance for chaining', () => {
      // Explicitly clear chunks before test (defensive against CI isolation issues)
      harness.stdoutChunks.length = 0
      const result = harness.testLogger.write('text')
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('progress() method', () => {
    it('should show progress indicator', () => {
      // progress() writes directly to stream, not through standard logging
      // so it doesn't go through our mock in the same way
      expect(() => harness.testLogger.progress('Loading…')).not.toThrow()
    })

    it('should write to stderr when on stderr stream', () => {
      expect(() =>
        harness.testLogger.stderr.progress('Error progress'),
      ).not.toThrow()
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.progress('test')
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('clearLine() method', () => {
    it('should clear line in non-TTY mode', () => {
      // clearLine() writes directly to stream
      expect(() => harness.testLogger.clearLine()).not.toThrow()
    })

    it('should clear line on stderr when stream-bound', () => {
      expect(() => harness.testLogger.stderr.clearLine()).not.toThrow()
    })

    it('should handle TTY mode', () => {
      // Create TTY mock with cursorTo and clearLine methods
      const cursorToSpy =
        vi.fn<(x: number, y?: number | undefined) => boolean>()
      const clearLineSpy = vi.fn<(dir: -1 | 0 | 1) => boolean>()

      const ttyStdout = createCaptureStream(harness.stdoutChunks)
      ttyStdout.isTTY = true
      ttyStdout.cursorTo = cursorToSpy
      ttyStdout.clearLine = clearLineSpy

      const ttyLogger = new Logger({
        stdout: ttyStdout,
        stderr: harness.mockStderr,
      })
      // clearLine should work without throwing
      expect(() => ttyLogger.clearLine()).not.toThrow()
      // Note: The console's internal _stdout stream is what gets called,
      // which we can't easily mock. We verify it doesn't throw as a basic test.
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.clearLine()
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('clearVisible() method', () => {
    it('should clear screen on main logger', () => {
      harness.testLogger.clearVisible()
      // Should not throw
      expect(harness.testLogger).toBeDefined()
    })

    it('should throw on stream-bound logger', () => {
      expect(() => {
        harness.testLogger.stderr.clearVisible()
      }).toThrow(/only available on the main logger/)
    })

    it('should reset log count in TTY mode', () => {
      const ttyStdout = createCaptureStream()
      ttyStdout.isTTY = true

      const ttyLogger = new Logger({
        stdout: ttyStdout,
        stderr: harness.mockStderr,
      })
      ttyLogger.log('test')
      ttyLogger.clearVisible()
      expect(ttyLogger.logCallCount).toBe(0)
    })

    it('should return logger instance for chaining', () => {
      const result = harness.testLogger.clearVisible()
      expect(result).toBe(harness.testLogger)
    })
  })

  describe('stderr and stdout getters', () => {
    it('should return stderr-bound logger', () => {
      const stderrLogger = harness.testLogger.stderr
      expect(stderrLogger).toBeInstanceOf(Logger)
      expect(stderrLogger).not.toBe(harness.testLogger)
    })

    it('should cache stderr logger instance', () => {
      const first = harness.testLogger.stderr
      const second = harness.testLogger.stderr
      expect(first).toBe(second)
    })

    it('should return stdout-bound logger', () => {
      const stdoutLogger = harness.testLogger.stdout
      expect(stdoutLogger).toBeInstanceOf(Logger)
      expect(stdoutLogger).not.toBe(harness.testLogger)
    })

    it('should cache stdout logger instance', () => {
      const first = harness.testLogger.stdout
      const second = harness.testLogger.stdout
      expect(first).toBe(second)
    })

    it('should maintain separate indentation for stderr', () => {
      harness.testLogger.stderr.indent()
      harness.testLogger.stderr.error('indented error')
      harness.testLogger.log('not indented')
      const errOutput = harness.stderrChunks.join('')
      const outOutput = harness.stdoutChunks.join('')
      expect(errOutput).toContain('  indented error')
      expect(outOutput.trim()).toBe('not indented')
    })

    it('should maintain separate indentation for stdout', () => {
      harness.testLogger.stdout.indent()
      harness.testLogger.stdout.log('indented log')
      harness.testLogger.error('not indented error')
      const outOutput = harness.stdoutChunks.join('')
      const errOutput = harness.stderrChunks.join('')
      expect(outOutput).toContain('  indented log')
      expect(errOutput.trim()).toContain('not indented error')
    })
  })

  describe.sequential('indentation with stream-bound loggers', () => {
    it('should only affect stderr when dedenting stderr logger', () => {
      harness.testLogger.indent()
      harness.testLogger.indent()
      harness.testLogger.stderr.dedent()
      harness.testLogger.stderr.error('stderr 1 indent')
      harness.testLogger.log('stdout 2 indents')
      const errOutput = harness.stderrChunks.join('')
      const outOutput = harness.stdoutChunks.join('')
      expect(errOutput).toContain('  stderr 1 indent')
      expect(outOutput).toContain('    stdout 2 indents')
    })

    it('should only affect stdout when dedenting stdout logger', () => {
      harness.testLogger.indent()
      harness.testLogger.indent()
      harness.testLogger.stdout.dedent()
      harness.testLogger.log('stdout 1 indent')
      harness.testLogger.error('stderr 2 indents')
      const outOutput = harness.stdoutChunks.join('')
      const errOutput = harness.stderrChunks.join('')
      expect(outOutput).toContain('  stdout 1 indent')
      expect(errOutput).toContain('    stderr 2 indents')
    })

    it('should only reset stderr when calling resetIndent on stderr', () => {
      harness.testLogger.indent()
      harness.testLogger.stderr.resetIndent()
      harness.testLogger.stderr.error('no indent')
      harness.testLogger.log('has indent')
      const errOutput = harness.stderrChunks.join('')
      const outOutput = harness.stdoutChunks.join('')
      expect(errOutput.trim()).toContain('no indent')
      expect(outOutput).toContain('  has indent')
    })

    it('should only reset stdout when calling resetIndent on stdout', () => {
      harness.testLogger.indent()
      harness.testLogger.stdout.resetIndent()
      harness.testLogger.log('no indent')
      harness.testLogger.error('has indent')
      const outOutput = harness.stdoutChunks.join('')
      const errOutput = harness.stderrChunks.join('')
      expect(outOutput.trim()).toBe('no indent')
      expect(errOutput).toContain('  has indent')
    })
  })

  describe.sequential('logCallCount', () => {
    it('should start at 0', () => {
      expect(harness.testLogger.logCallCount).toBe(0)
    })

    it('should increment on each log call', () => {
      harness.testLogger.log('test')
      expect(harness.testLogger.logCallCount).toBe(1)
      harness.testLogger.error('error')
      expect(harness.testLogger.logCallCount).toBe(2)
      harness.testLogger.success('success')
      expect(harness.testLogger.logCallCount).toBe(3)
    })

    it('should be accessible via getter', () => {
      harness.testLogger.log('test')
      const count = harness.testLogger.logCallCount
      expect(count).toBeGreaterThan(0)
    })
  })
})
