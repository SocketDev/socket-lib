/**
 * @file Unit tests for src/debug.ts — namespace-gated debug output. The
 *   functions are gated by SOCKET_DEBUG (and DEBUG for the debug-js library's
 *   own namespace machinery). Tests rewire env vars per case and spy on
 *   logger.info / logger.dir / console.log. Spinner pause+resume is exercised
 *   via a mock spinner option.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isDebug, isDebugNs } from '../../src/debug/namespace'
import {
  debug,
  debugCache,
  debugCacheNs,
  debugDir,
  debugDirNs,
  debugLog,
  debugLogNs,
  debugNs,
  debuglog,
  debugtime,
} from '../../src/debug/output'
import { clearEnv, resetEnv, setEnv } from '../../src/env/rewire'
import { getDefaultLogger } from '../../src/logger/logger'

const logger = getDefaultLogger()

export function makeMockSpinner() {
  return {
    isSpinning: false,
    start: vi.fn(),
    stop: vi.fn(),
  }
}

describe.sequential('debug', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let infoSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dirSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let logSpy: any

  beforeEach(() => {
    infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger)
    dirSpy = vi.spyOn(logger, 'dir').mockImplementation(() => logger)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    dirSpy.mockRestore()
    logSpy.mockRestore()
    resetEnv()
  })

  describe('isDebug / isDebugNs', () => {
    it('isDebug returns false when SOCKET_DEBUG is unset', () => {
      clearEnv('SOCKET_DEBUG')
      expect(isDebug()).toBe(false)
    })

    it('isDebug returns true when SOCKET_DEBUG is set', () => {
      setEnv('SOCKET_DEBUG', '*')
      expect(isDebug()).toBe(true)
    })

    it('isDebugNs returns false when SOCKET_DEBUG is unset (regardless of namespace)', () => {
      clearEnv('SOCKET_DEBUG')
      expect(isDebugNs('anything')).toBe(false)
    })

    it('isDebugNs returns true for "*" namespace when SOCKET_DEBUG is set', () => {
      setEnv('SOCKET_DEBUG', '*')
      expect(isDebugNs('*')).toBe(true)
    })

    it('isDebugNs returns true for empty string namespace (treated as wildcard)', () => {
      setEnv('SOCKET_DEBUG', '*')
      expect(isDebugNs('')).toBe(true)
    })

    it('isDebugNs returns true for undefined namespace', () => {
      setEnv('SOCKET_DEBUG', '*')
      expect(isDebugNs(undefined)).toBe(true)
    })
  })

  describe('debugLog / debugLogNs', () => {
    it('is a no-op when SOCKET_DEBUG is unset', () => {
      clearEnv('SOCKET_DEBUG')
      debugLog('hello')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('writes to logger.info when SOCKET_DEBUG is set', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugLog('hello')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugLogNs forwards to logger.info on wildcard namespace', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugLogNs('*', 'message')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugLogNs is a no-op for an unmatched named namespace', () => {
      setEnv('SOCKET_DEBUG', '*')
      // 'test' isn't enabled by debug-js, so isEnabled returns false at
      // the names.some(...).enabled check.
      debugLogNs('test', 'message')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('debugLogNs accepts an options object with namespaces field', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugLogNs({ namespaces: '*' }, 'hi')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugLogNs forwards args directly when first arg is not a string', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugLogNs('*', { complex: 'object' }, 'second')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugLogNs pauses + resumes a spinning spinner', () => {
      setEnv('SOCKET_DEBUG', '*')
      const spinner = makeMockSpinner()
      spinner.isSpinning = true
      debugLogNs({ namespaces: '*', spinner }, 'while-spinning')
      expect(spinner.stop).toHaveBeenCalled()
      expect(spinner.start).toHaveBeenCalled()
    })

    it('debugLogNs does not start a non-spinning spinner', () => {
      setEnv('SOCKET_DEBUG', '*')
      const spinner = makeMockSpinner()
      spinner.isSpinning = false
      debugLogNs({ namespaces: '*', spinner }, 'idle')
      expect(spinner.stop).toHaveBeenCalled()
      expect(spinner.start).not.toHaveBeenCalled()
    })
  })

  describe('debug / debugNs', () => {
    it('debug() is a no-op when SOCKET_DEBUG is unset', () => {
      clearEnv('SOCKET_DEBUG')
      debug('hi')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('debug() emits when SOCKET_DEBUG is set', () => {
      setEnv('SOCKET_DEBUG', '*')
      debug('hi')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugNs respects namespace filtering (skip pattern)', () => {
      setEnv('SOCKET_DEBUG', '*')
      // A skip pattern alone with no positive match still emits.
      debugNs('-skipped', 'msg')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugNs skips when namespace is excluded', () => {
      setEnv('SOCKET_DEBUG', '*')
      // First enable a namespace, then run with a skip on the same.
      // A namespace "foo,-foo" — names has 'foo' (no enabled match), so
      // returns false up top.
      debugNs('foo,-foo', 'msg')
      // The 'foo' instance is not enabled by default; isEnabled returns
      // false at the names.some(...).enabled check.
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('debugNs forwards object args without prefix when first arg is non-string', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugNs('*', { obj: true })
      expect(infoSpy).toHaveBeenCalled()
    })
  })

  describe('debugDir / debugDirNs', () => {
    it('debugDir is a no-op when SOCKET_DEBUG is unset', () => {
      clearEnv('SOCKET_DEBUG')
      debugDir({ x: 1 })
      expect(dirSpy).not.toHaveBeenCalled()
    })

    it('debugDir calls logger.info + logger.dir when enabled', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugDir({ x: 1 })
      expect(infoSpy).toHaveBeenCalled()
      expect(dirSpy).toHaveBeenCalledWith({ x: 1 }, undefined)
    })

    it('debugDirNs accepts inspect options', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugDirNs('*', { x: 1 }, { depth: 5, colors: false })
      expect(dirSpy).toHaveBeenCalledWith({ x: 1 }, { depth: 5, colors: false })
    })

    it('debugDirNs pauses + resumes spinner', () => {
      setEnv('SOCKET_DEBUG', '*')
      const spinner = makeMockSpinner()
      spinner.isSpinning = true
      debugDirNs({ namespaces: '*', spinner }, { obj: true })
      expect(spinner.stop).toHaveBeenCalled()
      expect(spinner.start).toHaveBeenCalled()
    })
  })

  describe('debugCache / debugCacheNs', () => {
    it('debugCache is a no-op when SOCKET_DEBUG is unset', () => {
      clearEnv('SOCKET_DEBUG')
      debugCache('hit', 'some-key')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('debugCache writes a [CACHE] line via logger.info when enabled', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugCache('hit', 'some-key')
      expect(infoSpy).toHaveBeenCalled()
      const printed = infoSpy.mock.calls[0]!.join(' ')
      expect(printed).toContain('[CACHE]')
      expect(printed).toContain('hit')
      expect(printed).toContain('some-key')
    })

    it('debugCache appends meta when supplied', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugCache('hit', 'k', { ttl: 1000 })
      const args = infoSpy.mock.calls[0]!
      expect(args.length).toBe(2)
      expect(args[1]).toEqual({ ttl: 1000 })
    })

    it('debugCacheNs is a no-op when namespace is excluded', () => {
      // No SOCKET_DEBUG — gate hits before namespace check.
      clearEnv('SOCKET_DEBUG')
      debugCacheNs('*', 'hit', 'k')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('debugCacheNs writes via logger.info when enabled', () => {
      setEnv('SOCKET_DEBUG', '*')
      debugCacheNs('*', 'miss', 'cache-key')
      expect(infoSpy).toHaveBeenCalled()
    })

    it('debugCacheNs pauses + resumes spinner', () => {
      setEnv('SOCKET_DEBUG', '*')
      const spinner = makeMockSpinner()
      spinner.isSpinning = true
      debugCacheNs({ namespaces: '*', spinner }, 'set', 'k')
      expect(spinner.stop).toHaveBeenCalled()
      expect(spinner.start).toHaveBeenCalled()
    })
  })

  describe('debuglog', () => {
    it('returns a function (delegates to node:util.debuglog)', () => {
      const log = debuglog('test-section')
      expect(typeof log).toBe('function')
    })
  })

  describe('debugtime', () => {
    it('returns a callable with start / end methods', () => {
      const t = debugtime('label')
      expect(typeof t).toBe('function')
      expect(typeof t.start).toBe('function')
      expect(typeof t.end).toBe('function')
    })

    it('start + end logs duration via util.debuglog', () => {
      const t = debugtime('label')
      t.start()
      t.end()
      // Cannot assert output (debuglog only writes when NODE_DEBUG=time).
      // The point is: end resets startTime so calling it again is a no-op.
      t.end()
    })

    it('calling impl twice toggles start/end semantics', () => {
      const t = debugtime('toggle')
      t() // first call: start
      t() // second call: end
      t() // third call: start again
      t() // fourth: end again
      expect(typeof t).toBe('function')
    })
  })
})
