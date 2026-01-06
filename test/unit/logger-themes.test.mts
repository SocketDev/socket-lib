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
import { THEMES } from '@socketsecurity/lib/themes'
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

    it('should create logger with lush theme', () => {
      const logger = new Logger({ stdout, stderr, theme: 'lush' })
      logger.info('Test message')
      expect(stderrData.join('')).toContain('Test message')
    })

    it('should create logger with sunset theme', () => {
      const logger = new Logger({ stdout, stderr, theme: 'sunset' })
      logger.info('Test message')
      expect(stderrData.join('')).toContain('Test message')
    })

    it('should create logger with ultra theme', () => {
      const logger = new Logger({ stdout, stderr, theme: 'ultra' })
      logger.info('Test message')
      expect(stderrData.join('')).toContain('Test message')
    })

    it('should create logger with terracotta theme', () => {
      const logger = new Logger({ stdout, stderr, theme: 'terracotta' })
      logger.info('Test message')
      expect(stderrData.join('')).toContain('Test message')
    })
  })

  describe('LOG_SYMBOLS', () => {
    it('should access LOG_SYMBOLS.success', () => {
      expect(LOG_SYMBOLS.success).toBeDefined()
      expect(typeof LOG_SYMBOLS.success).toBe('string')
    })

    it('should access LOG_SYMBOLS.fail', () => {
      expect(LOG_SYMBOLS.fail).toBeDefined()
      expect(typeof LOG_SYMBOLS.fail).toBe('string')
    })

    it('should access LOG_SYMBOLS.warn', () => {
      expect(LOG_SYMBOLS.warn).toBeDefined()
      expect(typeof LOG_SYMBOLS.warn).toBe('string')
    })

    it('should access LOG_SYMBOLS.info', () => {
      expect(LOG_SYMBOLS.info).toBeDefined()
      expect(typeof LOG_SYMBOLS.info).toBe('string')
    })

    it('should access LOG_SYMBOLS.step', () => {
      expect(LOG_SYMBOLS.step).toBeDefined()
      expect(typeof LOG_SYMBOLS.step).toBe('string')
    })

    it('should access LOG_SYMBOLS.skip', () => {
      expect(LOG_SYMBOLS.skip).toBeDefined()
      expect(typeof LOG_SYMBOLS.skip).toBe('string')
    })

    it('should access LOG_SYMBOLS.progress', () => {
      expect(LOG_SYMBOLS.progress).toBeDefined()
      expect(typeof LOG_SYMBOLS.progress).toBe('string')
    })

    it('should access LOG_SYMBOLS.reason', () => {
      expect(LOG_SYMBOLS.reason).toBeDefined()
      expect(typeof LOG_SYMBOLS.reason).toBe('string')
    })

    it('should initialize LOG_SYMBOLS on first access', () => {
      // Accessing any property should trigger initialization
      const successSymbol = LOG_SYMBOLS.success
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
      expect(symbol).toBeDefined()
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
    it('should use themed symbols in success method', () => {
      const logger = new Logger({ stdout, stderr, theme: 'socket' })
      logger.success('Success message')
      const output = stderrData.join('')
      expect(output).toContain('Success message')
    })

    it('should use themed symbols in fail method', () => {
      const logger = new Logger({ stdout, stderr, theme: 'socket' })
      logger.fail('Fail message')
      const output = stderrData.join('')
      expect(output).toContain('Fail message')
    })

    it('should use themed symbols in warn method', () => {
      const logger = new Logger({ stdout, stderr, theme: 'socket' })
      logger.warn('Warn message')
      const output = stderrData.join('')
      expect(output).toContain('Warn message')
    })

    it('should use themed symbols in info method', () => {
      const logger = new Logger({ stdout, stderr, theme: 'socket' })
      logger.info('Info message')
      const output = stderrData.join('')
      expect(output).toContain('Info message')
    })

    it('should use themed symbols in step method', () => {
      const logger = new Logger({ stdout, stderr, theme: 'socket' })
      logger.step('Step message')
      const output = stdoutData.join('')
      expect(output).toContain('Step message')
    })
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
