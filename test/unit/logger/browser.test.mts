/**
 * @file Unit tests for the browser-safe `Logger` class.
 *
 *   - Constructor produces an instance with the documented methods
 *   - Every method returns the logger (chainable)
 *   - Methods route to the right console.* sink (log/warn/error)
 *   - Status symbols (✓ ⚠ ✕ ℹ) are prefixed inline
 *   - No reliance on node:process / node:console / fs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MockInstance } from 'vitest'

import { Logger } from '../../../src/logger/browser'

describe('logger/browser → Logger', () => {
  let logSpy: MockInstance
  let warnSpy: MockInstance
  let errorSpy: MockInstance

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('exposes the documented methods', () => {
    const logger = new Logger()
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.success).toBe('function')
    expect(typeof logger.fail).toBe('function')
  })

  it('every method returns the logger (chainable)', () => {
    const logger = new Logger()
    expect(logger.log('a')).toBe(logger)
    expect(logger.info('a')).toBe(logger)
    expect(logger.warn('a')).toBe(logger)
    expect(logger.error('a')).toBe(logger)
    expect(logger.success('a')).toBe(logger)
    expect(logger.fail('a')).toBe(logger)
  })

  it('log() routes to console.log without a symbol prefix', () => {
    new Logger().log('hello')
    expect(logSpy).toHaveBeenCalledWith('hello')
  })

  it('info() prefixes with ℹ and routes to console.log', () => {
    new Logger().info('hello')
    expect(logSpy).toHaveBeenCalledWith('ℹ', 'hello')
  })

  it('warn() prefixes with ⚠ and routes to console.warn', () => {
    new Logger().warn('hello')
    expect(warnSpy).toHaveBeenCalledWith('⚠', 'hello')
  })

  it('error() prefixes with ✕ and routes to console.error', () => {
    new Logger().error('hello')
    expect(errorSpy).toHaveBeenCalledWith('✕', 'hello')
  })

  it('success() prefixes with ✓ and routes to console.log', () => {
    new Logger().success('hello')
    expect(logSpy).toHaveBeenCalledWith('✓', 'hello')
  })

  it('fail() is an alias for error()', () => {
    new Logger().fail('boom')
    expect(errorSpy).toHaveBeenCalledWith('✕', 'boom')
  })

  it('passes extra args through unchanged', () => {
    new Logger().info('a', { x: 1 }, [2, 3])
    expect(logSpy).toHaveBeenCalledWith('ℹ', 'a', { x: 1 }, [2, 3])
  })
})
