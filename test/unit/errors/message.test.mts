/**
 * @file Unit tests for src/errors/message — errorMessage, UNKNOWN_ERROR.
 */

import vm from 'node:vm'

import { UNKNOWN_ERROR as canonicalUnknownError } from '@socketsecurity/lib-stable/errors/message'

import { describe, expect, it } from 'vitest'

import { errorMessage, UNKNOWN_ERROR } from '../../../src/errors/message'

describe('errorMessage', () => {
  it('returns the message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('walks cause chains', () => {
    const cause = new Error('underlying')
    const outer = new Error('wrapper', { cause })
    const result = errorMessage(outer)
    expect(result).toContain('wrapper')
    expect(result).toContain('underlying')
  })

  it('handles Error subclasses', () => {
    class CustomError extends Error {}
    expect(errorMessage(new CustomError('custom'))).toBe('custom')
  })

  it('returns the stable sentinel for an Error with no message', () => {
    const e = new Error('')
    expect(errorMessage(e)).toBe(canonicalUnknownError)
  })

  it('returns a string value as-is', () => {
    expect(errorMessage('plain string')).toBe('plain string')
  })

  it('coerces numbers', () => {
    expect(errorMessage(42)).toBe('42')
  })

  it('coerces booleans', () => {
    expect(errorMessage(false)).toBe('false')
  })

  it('returns the sentinel for null', () => {
    expect(errorMessage(undefined)).toBe(canonicalUnknownError)
  })

  it('returns the sentinel for undefined', () => {
    expect(errorMessage(undefined)).toBe(canonicalUnknownError)
  })

  it('returns the sentinel for a plain object with no meaningful string', () => {
    expect(errorMessage({})).toBe(canonicalUnknownError)
    expect(errorMessage({ foo: 'bar' })).toBe(canonicalUnknownError)
  })

  it('returns the sentinel for an empty string', () => {
    expect(errorMessage('')).toBe(canonicalUnknownError)
  })

  it('respects an object with a custom toString', () => {
    const thrown = {
      toString() {
        return 'custom toString'
      },
    }
    expect(errorMessage(thrown)).toBe('custom toString')
  })

  it('exposes the sentinel constant', () => {
    expect(UNKNOWN_ERROR).toBe('Unknown error')
  })
})

describe('cross-realm Error handling', () => {
  it('errorMessage extracts message from cross-realm Error', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext('new Error("remote boom")', ctx)
    expect(errorMessage(remoteErr)).toContain('remote boom')
  })

  it('errorMessage walks cross-realm cause chain', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext(
      'new Error("outer", { cause: new Error("inner") })',
      ctx,
    )
    const result = errorMessage(remoteErr)
    expect(result).toContain('outer')
    expect(result).toContain('inner')
  })
})
