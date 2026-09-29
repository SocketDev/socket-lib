/**
 * @file Type-level tests for the string shape types in
 *   `src/strings/shape-types.mts`. These assertions run at compile time via
 *   `pnpm run type`, which type-checks test/**, and every negative case is a
 *   `@ts-expect-error` — if the shapes ever widen (e.g. a refactor drops the
 *   `& {}` trick or the `End` marker), tsc reports the unused directive and
 *   fails. The probe closures are intentionally never invoked and the module
 *   has no runtime at all: nothing here executes.
 */

import { describe, expectTypeOf, it } from 'vitest'

import type {
  Char,
  Digit,
  End,
  ExactChars,
  ExactDigits,
  NonEmpty,
} from '../../../src/strings/shape-types.mts'

describe('strings/shapes — NonEmpty', () => {
  it('accepts any non-empty string literal', () => {
    expectTypeOf<'x'>().toExtend<NonEmpty>()
    expectTypeOf<'hello'>().toExtend<NonEmpty>()
    expectTypeOf<' '>().toExtend<NonEmpty>()
  })

  it('rejects the empty string', () => {
    // @ts-expect-error — the empty string is exactly what NonEmpty excludes.
    expectTypeOf<''>().toExtend<NonEmpty>()
  })
})

describe('strings/shapes — ExactChars', () => {
  it('accepts literals of the exact length', () => {
    expectTypeOf<'USA'>().toExtend<ExactChars<3>>()
    expectTypeOf<'ab'>().toExtend<ExactChars<2>>()
    expectTypeOf<'a'>().toExtend<ExactChars<1>>()
  })

  it('rejects shorter literals', () => {
    // @ts-expect-error — 2 characters for a 3-character shape.
    expectTypeOf<'US'>().toExtend<ExactChars<3>>()
  })

  it('rejects longer literals', () => {
    // @ts-expect-error — 4 characters for a 3-character shape.
    expectTypeOf<'USAA'>().toExtend<ExactChars<3>>()
  })
})

describe('strings/shapes — ExactDigits', () => {
  it('accepts digit literals of the exact length', () => {
    expectTypeOf<'0427'>().toExtend<ExactDigits<4>>()
    expectTypeOf<'0000'>().toExtend<ExactDigits<4>>()
  })

  it('rejects literals containing non-digits', () => {
    // @ts-expect-error — 'a' is not a digit slot.
    expectTypeOf<'04a7'>().toExtend<ExactDigits<4>>()
  })

  it('rejects shorter digit literals', () => {
    // @ts-expect-error — 3 digits for a 4-digit shape.
    expectTypeOf<'042'>().toExtend<ExactDigits<4>>()
  })

  it('rejects longer digit literals', () => {
    // @ts-expect-error — 5 digits for a 4-digit shape.
    expectTypeOf<'04275'>().toExtend<ExactDigits<4>>()
  })
})

describe('strings/shapes — slot primitives', () => {
  it('End matches only the empty string', () => {
    expectTypeOf<''>().toExtend<End>()
    // @ts-expect-error — End only matches ''.
    expectTypeOf<' '>().toExtend<End>()
  })

  it('Char composes to a fixed length with End', () => {
    expectTypeOf<'ab'>().toExtend<`${Char}${Char}${End}`>()
    // @ts-expect-error — one character short of the two Char slots.
    expectTypeOf<'a'>().toExtend<`${Char}${Char}${End}`>()
  })

  it('Digit composes to a fixed length with End', () => {
    expectTypeOf<'42'>().toExtend<`${Digit}${Digit}${End}`>()
    // @ts-expect-error — one digit short of the two Digit slots.
    expectTypeOf<'4'>().toExtend<`${Digit}${Digit}${End}`>()
  })
})
