/**
 * @file Unit tests for src/debug/namespace — isDebug, isDebugNs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isDebug, isDebugNs } from '../../../src/debug/namespace'
import { clearEnv, resetEnv, setEnv } from '../../../src/env/rewire'

describe.sequential('debug/namespace', () => {
  beforeEach(() => {
    vi.stubEnv('SOCKET_DEBUG', '')
  })

  afterEach(() => {
    resetEnv()
    vi.unstubAllEnvs()
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
})
