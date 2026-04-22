/**
 * @fileoverview Unit tests for error utilities.
 *
 * Tests `errorMessage` / `errorStack` helpers that normalize caught values
 * (Error, string, plain object, null, undefined) into readable strings
 * with a stable `Unknown error` fallback, plus the spec-compliant
 * `isError` cross-realm predicate.
 */

import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import {
  UNKNOWN_ERROR,
  errorMessage,
  errorStack,
  isErrnoException,
  isError,
  isErrorBuiltin,
  isErrorShim,
} from '@socketsecurity/lib/errors'

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
    expect(errorMessage(e)).toBe(UNKNOWN_ERROR)
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
    expect(errorMessage(null)).toBe(UNKNOWN_ERROR)
  })

  it('returns the sentinel for undefined', () => {
    expect(errorMessage(undefined)).toBe(UNKNOWN_ERROR)
  })

  it('returns the sentinel for a plain object with no meaningful string', () => {
    expect(errorMessage({})).toBe(UNKNOWN_ERROR)
    expect(errorMessage({ foo: 'bar' })).toBe(UNKNOWN_ERROR)
  })

  it('returns the sentinel for an empty string', () => {
    expect(errorMessage('')).toBe(UNKNOWN_ERROR)
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
    expect(errorStack(null)).toBeUndefined()
    expect(errorStack(undefined)).toBeUndefined()
    expect(errorStack({})).toBeUndefined()
  })
})

describe('isError', () => {
  it('recognizes Error instances', () => {
    expect(isError(new Error('x'))).toBe(true)
  })

  it('recognizes Error subclass instances', () => {
    expect(isError(new TypeError('x'))).toBe(true)
    expect(isError(new RangeError('x'))).toBe(true)
    class CustomError extends Error {}
    expect(isError(new CustomError('x'))).toBe(true)
  })

  it('rejects plain objects even with name + message', () => {
    expect(isError({ name: 'Error', message: 'fake' })).toBe(false)
  })

  it('rejects primitives', () => {
    expect(isError('not an error')).toBe(false)
    expect(isError(42)).toBe(false)
    expect(isError(true)).toBe(false)
    expect(isError(Symbol('x'))).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isError(null)).toBe(false)
    expect(isError(undefined)).toBe(false)
  })

  it('rejects arrays and functions', () => {
    expect(isError([])).toBe(false)
    expect(isError(() => {})).toBe(false)
  })

  it('recognizes cross-realm Errors (vm context)', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext('new Error("cross realm")', ctx)
    expect(remoteErr instanceof Error).toBe(false)
    expect(isError(remoteErr)).toBe(true)
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

  it('errorStack returns a stack for a cross-realm Error', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext('new Error("remote stack")', ctx)
    const stack = errorStack(remoteErr)
    expect(typeof stack).toBe('string')
    expect(stack).toContain('remote stack')
  })
})

describe('isErrnoException', () => {
  it('recognizes Errors with a string code', () => {
    const e = Object.assign(new Error('file not found'), { code: 'ENOENT' })
    expect(isErrnoException(e)).toBe(true)
  })

  it('narrows the type so code is accessible', () => {
    const e: unknown = Object.assign(new Error('x'), { code: 'EACCES' })
    if (isErrnoException(e)) {
      // TypeScript narrowing: e.code should be string | undefined
      expect(e.code).toBe('EACCES')
    } else {
      throw new Error('expected narrowing to succeed')
    }
  })

  it('rejects Errors with a non-string code', () => {
    const e = Object.assign(new Error('x'), { code: 42 })
    expect(isErrnoException(e)).toBe(false)
  })

  it('rejects Errors with no code', () => {
    expect(isErrnoException(new Error('x'))).toBe(false)
  })

  it('rejects Errors with an empty code', () => {
    const e = Object.assign(new Error('x'), { code: '' })
    expect(isErrnoException(e)).toBe(false)
  })

  it('rejects Errors whose code does not start with an uppercase letter', () => {
    const lower = Object.assign(new Error('x'), { code: 'enoent' })
    const digit = Object.assign(new Error('x'), { code: '1bad' })
    const sym = Object.assign(new Error('x'), { code: '_TAG' })
    expect(isErrnoException(lower)).toBe(false)
    expect(isErrnoException(digit)).toBe(false)
    expect(isErrnoException(sym)).toBe(false)
  })

  it('accepts common libuv and Node errno codes', () => {
    for (const code of [
      'ENOENT',
      'EACCES',
      'EBUSY',
      'EPERM',
      'EEXIST',
      'EAGAIN',
      'ERR_INVALID_ARG_TYPE',
      'ERR_MODULE_NOT_FOUND',
    ]) {
      const e = Object.assign(new Error('x'), { code })
      expect(isErrnoException(e)).toBe(true)
    }
  })

  it('rejects non-Error values with a code property', () => {
    expect(isErrnoException({ code: 'ENOENT' })).toBe(false)
    expect(
      isErrnoException({ name: 'Error', message: 'x', code: 'ENOENT' }),
    ).toBe(false)
  })

  it('rejects primitives and nullish', () => {
    expect(isErrnoException(null)).toBe(false)
    expect(isErrnoException(undefined)).toBe(false)
    expect(isErrnoException('ENOENT')).toBe(false)
    expect(isErrnoException(42)).toBe(false)
  })

  it('recognizes cross-realm errno errors', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext(
      'Object.assign(new Error("remote"), { code: "ENOENT" })',
      ctx,
    )
    expect(remoteErr instanceof Error).toBe(false)
    expect(isErrnoException(remoteErr)).toBe(true)
  })
})

// The shim fires on engines without native `Error.isError` (Node < 22.11).
// Our CI runs on Node >= 22 where the native method is usually present,
// so `isError` aliases to native. Exercise the shim path directly here
// to keep its behavior covered regardless of engine.
describe('isErrorShim', () => {
  it('recognizes Error instances', () => {
    expect(isErrorShim(new Error('x'))).toBe(true)
  })

  it('recognizes Error subclasses', () => {
    expect(isErrorShim(new TypeError('x'))).toBe(true)
    expect(isErrorShim(new RangeError('x'))).toBe(true)
  })

  it('recognizes cross-realm Errors via the @@toStringTag brand', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext('new Error("cross realm")', ctx)
    expect(isErrorShim(remoteErr)).toBe(true)
  })

  it('rejects plain objects with name + message', () => {
    expect(isErrorShim({ name: 'Error', message: 'fake' })).toBe(false)
  })

  it('rejects null and undefined', () => {
    expect(isErrorShim(null)).toBe(false)
    expect(isErrorShim(undefined)).toBe(false)
  })

  it('rejects primitives', () => {
    expect(isErrorShim('string')).toBe(false)
    expect(isErrorShim(42)).toBe(false)
    expect(isErrorShim(true)).toBe(false)
  })

  it('rejects arrays', () => {
    expect(isErrorShim([])).toBe(false)
  })

  it('false-positives on values that set Symbol.toStringTag to "Error"', () => {
    // Documented limitation of the shim — native `Error.isError` reads
    // the `[[ErrorData]]` slot and can't be fooled this way. Test pins
    // the known false-positive so a future behavior change is caught.
    const fake = {}
    Object.defineProperty(fake, Symbol.toStringTag, { value: 'Error' })
    expect(isErrorShim(fake)).toBe(true)
  })
})

// `isErrorBuiltin` is the native ES2025 `Error.isError` (or `undefined`
// on older engines). These tests only run when the native method is
// present — they document the slot-based check that the shim can only
// approximate, and ensure we're actually calling the builtin when we
// claim to.
describe.skipIf(typeof isErrorBuiltin !== 'function')('isErrorBuiltin', () => {
  // Narrow once so TS knows `isErrorBuiltin` is defined in each `it`.
  const builtin = isErrorBuiltin as (v: unknown) => v is Error

  it('recognizes Error instances', () => {
    expect(builtin(new Error('x'))).toBe(true)
  })

  it('recognizes Error subclasses', () => {
    expect(builtin(new TypeError('x'))).toBe(true)
    expect(builtin(new RangeError('x'))).toBe(true)
  })

  it('recognizes cross-realm Errors', () => {
    const ctx = vm.createContext({})
    const remoteErr = vm.runInContext('new Error("cross realm")', ctx)
    expect(builtin(remoteErr)).toBe(true)
  })

  it('rejects values faking Symbol.toStringTag = "Error" (slot check)', () => {
    // This is the key behavior difference from the shim — native uses
    // the internal `[[ErrorData]]` slot, which cannot be forged.
    const fake = {}
    Object.defineProperty(fake, Symbol.toStringTag, { value: 'Error' })
    expect(builtin(fake)).toBe(false)
  })

  it('rejects plain objects with name + message', () => {
    expect(builtin({ name: 'Error', message: 'fake' })).toBe(false)
  })

  it('rejects null, undefined, and primitives', () => {
    expect(builtin(null)).toBe(false)
    expect(builtin(undefined)).toBe(false)
    expect(builtin('string')).toBe(false)
    expect(builtin(42)).toBe(false)
  })

  it('is the function isError delegates to when available', () => {
    expect(isError).toBe(builtin)
  })
})
