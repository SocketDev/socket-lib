/**
 * @file Unit tests for the browser-safe Logger surface.
 *
 *   - Singleton accessor returns one shared instance
 *   - Every method on BrowserLogger returns the logger (chainable)
 *   - Methods route to the right console.* sink (log/warn/error)
 *   - Status symbols (✓ ⚠ ✕ ℹ) are prefixed inline
 *   - No reliance on node:process / node:console / fs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MockInstance } from 'vitest'

import { getDefaultLogger } from '../../../src/logger/browser'

describe('logger/browser → getDefaultLogger', () => {
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

  it('returns a logger with the documented methods', () => {
    const logger = getDefaultLogger()
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.success).toBe('function')
    expect(typeof logger.fail).toBe('function')
  })

  it('returns the same instance across calls (singleton)', () => {
    const a = getDefaultLogger()
    const b = getDefaultLogger()
    expect(a).toBe(b)
  })

  it('every method returns the logger (chainable)', () => {
    const logger = getDefaultLogger()
    expect(logger.log('a')).toBe(logger)
    expect(logger.info('a')).toBe(logger)
    expect(logger.warn('a')).toBe(logger)
    expect(logger.error('a')).toBe(logger)
    expect(logger.success('a')).toBe(logger)
    expect(logger.fail('a')).toBe(logger)
  })

  it('log() routes to console.log without a symbol prefix', () => {
    const logger = getDefaultLogger()
    logger.log('hello')
    expect(logSpy).toHaveBeenCalledWith('hello')
  })

  it('info() prefixes with ℹ and routes to console.log', () => {
    const logger = getDefaultLogger()
    logger.info('hello')
    expect(logSpy).toHaveBeenCalledWith('ℹ', 'hello')
  })

  it('warn() prefixes with ⚠ and routes to console.warn', () => {
    const logger = getDefaultLogger()
    logger.warn('hello')
    expect(warnSpy).toHaveBeenCalledWith('⚠', 'hello')
  })

  it('error() prefixes with ✕ and routes to console.error', () => {
    const logger = getDefaultLogger()
    logger.error('hello')
    expect(errorSpy).toHaveBeenCalledWith('✕', 'hello')
  })

  it('success() prefixes with ✓ and routes to console.log', () => {
    const logger = getDefaultLogger()
    logger.success('hello')
    expect(logSpy).toHaveBeenCalledWith('✓', 'hello')
  })

  it('fail() is an alias for error()', () => {
    const logger = getDefaultLogger()
    logger.fail('boom')
    expect(errorSpy).toHaveBeenCalledWith('✕', 'boom')
  })

  it('passes extra args through unchanged', () => {
    const logger = getDefaultLogger()
    logger.info('a', { x: 1 }, [2, 3])
    expect(logSpy).toHaveBeenCalledWith('ℹ', 'a', { x: 1 }, [2, 3])
  })
})
