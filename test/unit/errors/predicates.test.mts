/**
 * @file Unit tests for src/errors/predicates — isError, isErrnoException,
 *   isErrorBuiltin, isErrorShim.
 */

import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import {
  isErrnoException,
  isError,
  isErrorBuiltin,
  isErrorShim,
} from '../../../src/errors/predicates'

import { describeRequires } from '../util/skip-helpers'

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
    expect(isError(undefined)).toBe(false)
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

describe('isErrnoException', () => {
  it('recognizes Errors with a string code', () => {
    const e = Object.assign(new Error('file not found'), { code: 'ENOENT' })
    expect(isErrnoException(e)).toBe(true)
  })

  it('narrows the type so code is accessible', () => {
    const e: unknown = Object.assign(new Error('x'), { code: 'EACCES' })
    if (isErrnoException(e)) {
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
    expect(isErrnoException(undefined)).toBe(false)
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
    expect(isErrorShim(undefined)).toBe(false)
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
    const fake = {}
    Object.defineProperty(fake, Symbol.toStringTag, { value: 'Error' })
    expect(isErrorShim(fake)).toBe(true)
  })
})

describeRequires(
  'Error.isError',
  typeof isErrorBuiltin === 'function',
  'isErrorBuiltin',
  () => {
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
      const fake = {}
      Object.defineProperty(fake, Symbol.toStringTag, { value: 'Error' })
      expect(builtin(fake)).toBe(false)
    })

    it('rejects plain objects with name + message', () => {
      expect(builtin({ name: 'Error', message: 'fake' })).toBe(false)
    })

    it('rejects null, undefined, and primitives', () => {
      expect(builtin(undefined)).toBe(false)
      expect(builtin(undefined)).toBe(false)
      expect(builtin('string')).toBe(false)
      expect(builtin(42)).toBe(false)
    })

    it('is the function isError delegates to when available', () => {
      expect(isError).toBe(builtin)
    })
  },
)
