/**
 * @fileoverview Tests for Logger theme handling and LOG_SYMBOLS.
 *
 * Tests theme-related Logger functionality including:
 * - Logger initialization with theme options (string and object)
 * - Theme changes and LOG_SYMBOLS updates
 * - Theme color application to symbols
 * - LOG_SYMBOLS access triggers initialization
 */

import { Writable } from 'node:stream'

import { Logger, LOG_SYMBOLS } from '@socketsecurity/lib/logger'
import { THEMES } from '@socketsecurity/lib/themes/themes'
import { describe, expect, it, beforeEach } from 'vitest'

describe('Logger - Theme Handling', () => {
  let stdout: Writable
  let stderr: Writable
  let stdoutData: string[]
  let stderrData: string[]

  beforeEach(() => {
    stdoutData = []
    stderrData = []

    stdout = new Writable({
      write(chunk, _encoding, callback) {
        stdoutData.push(chunk.toString())
        callback()
      },
    })

    stderr = new Writable({
      write(chunk, _encoding, callback) {
        stderrData.push(chunk.toString())
        callback()
      },
    })
  })

  describe('Logger constructor with theme', () => {
    it('should create logger with theme string', () => {
      const logger = new Logger({ stdout, stderr, theme: 'socket' })
      expect(logger).toBeDefined()
    })

    it('should create logger with theme object', () => {
      const logger = new Logger({ stdout, stderr, theme: THEMES.lush })
      expect(logger).toBeDefined()
    })

    it.each(['lush', 'sunset', 'ultra', 'terracotta'] as const)(
      'should create logger with %s theme and write messages',
      theme => {
        const logger = new Logger({ stdout, stderr, theme })
        logger.info('Test message')
        expect(stderrData.join('')).toContain('Test message')
      },
    )
  })

  describe('LOG_SYMBOLS', () => {
    it.each([
      'success',
      'fail',
      'warn',
      'info',
      'step',
      'skip',
      'progress',
      'reason',
    ] as const)('should expose string symbol for %s', key => {
      expect(LOG_SYMBOLS[key]).toBeDefined()
      expect(typeof LOG_SYMBOLS[key]).toBe('string')
    })

    it('should initialize LOG_SYMBOLS on first access', () => {
      // Accessing any property should trigger initialization
      const successSymbol = LOG_SYMBOLS['success']
      expect(successSymbol).toBeTruthy()
    })

    it('should support Reflect operations on LOG_SYMBOLS', () => {
      const keys = Reflect.ownKeys(LOG_SYMBOLS)
      expect(keys.length).toBeGreaterThan(0)
    })

    it('should support has operation on LOG_SYMBOLS', () => {
      const hasSuccess = Reflect.has(LOG_SYMBOLS, 'success')
      expect(hasSuccess).toBe(true)
    })

    it('should support get operation on LOG_SYMBOLS', () => {
      const symbol = Reflect.get(LOG_SYMBOLS, 'success')
      expect(symbol).toBe(LOG_SYMBOLS['success'])
    })

    it('should support getOwnPropertyDescriptor on LOG_SYMBOLS', () => {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        LOG_SYMBOLS,
        'success',
      )
      expect(descriptor).toBeDefined()
    })
  })

  describe('Theme changes', () => {
    it('should log with different themes', () => {
      const logger1 = new Logger({ stdout, stderr, theme: 'socket' })
      logger1.success('Socket theme')

      stderrData = []

      const logger2 = new Logger({ stdout, stderr, theme: 'lush' })
      logger2.success('Lush theme')

      expect(stderrData.join('')).toContain('Lush theme')
    })

    it('should handle theme object with all colors', () => {
      const customTheme = THEMES.socket
      const logger = new Logger({ stdout, stderr, theme: customTheme })
      logger.info('Custom theme test')
      expect(stderrData.join('')).toContain('Custom theme test')
    })
  })

  describe('Symbol usage in logging', () => {
    it.each([
      { method: 'success', stream: 'stderr' },
      { method: 'fail', stream: 'stderr' },
      { method: 'warn', stream: 'stderr' },
      { method: 'info', stream: 'stderr' },
      { method: 'step', stream: 'stdout' },
    ] as const)(
      'should write themed $method output to $stream',
      ({ method, stream }) => {
        const logger = new Logger({ stdout, stderr, theme: 'socket' })
        const message = `${method} message`
        ;(logger as unknown as Record<string, (msg: string) => void>)[method]!(
          message,
        )
        const output = (stream === 'stderr' ? stderrData : stdoutData).join('')
        expect(output).toContain(message)
      },
    )
  })

  describe('Stream-specific loggers', () => {
    it('should create stderr-bound logger', () => {
      const logger = new Logger({ stdout, stderr })
      const stderrLogger = logger.stderr
      expect(stderrLogger).toBeDefined()
      expect(stderrLogger).toBeInstanceOf(Logger)
    })

    it('should write to stderr via stderr logger', () => {
      // Reset arrays before test
      stdoutData = []
      stderrData = []

      const logger = new Logger({ stdout, stderr })
      logger.stderr.error('Error on stderr')
      expect(stderrData.join('')).toContain('Error on stderr')
      expect(stdoutData).toHaveLength(0)
    })

    it('should cache stderr logger instance', () => {
      const logger = new Logger({ stdout, stderr })
      const stderr1 = logger.stderr
      const stderr2 = logger.stderr
      expect(stderr1).toBe(stderr2)
    })

    it('should create stdout-bound logger', () => {
      const logger = new Logger({ stdout, stderr })
      const stdoutLogger = logger.stdout
      expect(stdoutLogger).toBeDefined()
      expect(stdoutLogger).toBeInstanceOf(Logger)
    })

    it('should write to stdout via stdout logger', () => {
      // Reset arrays before test
      stdoutData = []
      stderrData = []

      const logger = new Logger({ stdout, stderr })
      logger.stdout.log('Output on stdout')
      expect(stdoutData.join('')).toContain('Output on stdout')
      expect(stderrData).toHaveLength(0)
    })

    it('should cache stdout logger instance', () => {
      const logger = new Logger({ stdout, stderr })
      const stdout1 = logger.stdout
      const stdout2 = logger.stdout
      expect(stdout1).toBe(stdout2)
    })

    it('should maintain separate indentation for stderr', () => {
      const logger = new Logger({ stdout, stderr })
      logger.stderr.indent()
      logger.stderr.error('Indented stderr')
      logger.stderr.dedent()
      expect(stderrData.join('')).toContain('Indented stderr')
    })

    it('should maintain separate indentation for stdout', () => {
      const logger = new Logger({ stdout, stderr })
      logger.stdout.indent()
      logger.stdout.log('Indented stdout')
      logger.stdout.dedent()
      expect(stdoutData.join('')).toContain('Indented stdout')
    })

    it('should maintain theme in stderr logger', () => {
      const logger = new Logger({ stdout, stderr, theme: 'lush' })
      logger.stderr.info('Themed stderr')
      expect(stderrData.join('')).toContain('Themed stderr')
    })

    it('should maintain theme in stdout logger', () => {
      const logger = new Logger({ stdout, stderr, theme: 'lush' })
      logger.stdout.step('Themed stdout')
      expect(stdoutData.join('')).toContain('Themed stdout')
    })
  })
})
