/**
 * @file Unit tests for src/errors/stack — errorStack.
 */

import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import { errorStack } from '../../../src/errors/stack'

describe('errorStack', () => {
  it('returns a stack for an Error', () => {
    const e = new Error('boom')
    const stack = errorStack(e)
    expect(typeof stack).toBe('string')
    expect(stack).toContain('Error')
    expect(stack).toContain('boom')
  })

  it('includes cause chain in the stack', () => {
    const cause = new Error('underlying')
    const outer = new Error('wrapper', { cause })
    const stack = errorStack(outer)
    expect(stack).toContain('wrapper')
    expect(stack).toContain('underlying')
  })

  it('returns undefined for non-Error values', () => {
    expect(errorStack('string')).toBeUndefined()
    expect(errorStack(42)).toBeUndefined()
    expect(errorStack(undefined)).toBeUndefined()
    expect(errorStack(undefined)).toBeUndefined()
    expect(errorStack({})).toBeUndefined()
  })

  it('errorStack returns a stack for a cross-realm Error', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext('new Error("remote stack")', ctx)
    const stack = errorStack(remoteErr)
    expect(typeof stack).toBe('string')
    expect(stack).toContain('remote stack')
  })
})
