/**
 * @file Unit tests for src/primordials/function — Function prototype
 *   primordials. Split out of the historical monolithic
 *   test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  FunctionPrototypeApply,
  FunctionPrototypeBind,
  FunctionPrototypeCall,
  FunctionPrototypeToString,
} from '../../../src/primordials/function'

describe('Function (prototype)', () => {
  it('FunctionPrototypeApply invokes with thisArg + args array', () => {
    const greet = function (this: { greeting: string }, name: string): string {
      return `${this.greeting}, ${name}`
    }
    expect(
      FunctionPrototypeApply(greet as never, { greeting: 'Hi' }, ['Jane']),
    ).toBe('Hi, Jane')
  })

  it('FunctionPrototypeBind returns a bound function', () => {
    const add = (a: number, b: number): number => a + b
    const add3 = FunctionPrototypeBind(add as never, undefined, 3) as (
      b: number,
    ) => number
    expect(add3(4)).toBe(7)
  })

  it('FunctionPrototypeCall invokes with thisArg + variadic args', () => {
    const greet = function (this: { greeting: string }, name: string): string {
      return `${this.greeting}, ${name}`
    }
    expect(
      FunctionPrototypeCall(greet as never, { greeting: 'Hi' }, 'Jane'),
    ).toBe('Hi, Jane')
  })

  it('FunctionPrototypeToString returns the source representation', () => {
    function namedFn(): number {
      return 1
    }
    const out = FunctionPrototypeToString(namedFn as never)
    // Engine-specific exact format, but must include the function name.
    expect(out).toContain('namedFn')
  })
})
