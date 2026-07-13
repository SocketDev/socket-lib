/**
 * @file Unit tests for src/cacache/_internal — getCacache.
 */

import { describe, expect, it } from 'vitest'

import { getCacache } from '../../../src/cacache/_internal'

describe('getCacache', () => {
  it('should export getCacache function', () => {
    expect(typeof getCacache).toBe('function')
  })

  it('should return cacache module', () => {
    const cacache = getCacache()
    expect(typeof cacache).toBe('object')
  })

  it('should have expected cacache methods', () => {
    const cacache = getCacache()
    expect(typeof cacache.get).toBe('function')
    expect(typeof cacache.put).toBe('function')
    // rm and ls are namespaces with methods like rm.entry, rm.all, ls.stream
    expect(typeof cacache.rm.entry).toBe('function')
    expect(typeof cacache.ls.stream).toBe('function')
  })
})
