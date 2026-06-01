/**
 * @file Unit tests for src/primordials/math — Math primordials. Split out of
 *   the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  MathAbs,
  MathAcos,
  MathAcosh,
  MathAsin,
  MathAsinh,
  MathAtan,
  MathAtan2,
  MathAtanh,
  MathCbrt,
  MathCeil,
  MathClz32,
  MathCos,
  MathCosh,
  MathE,
  MathExp,
  MathExpm1,
  MathF16round,
  MathFloor,
  MathFround,
  MathHypot,
  MathImul,
  MathLN10,
  MathLN2,
  MathLOG10E,
  MathLOG2E,
  MathLog,
  MathLog10,
  MathLog1p,
  MathLog2,
  MathMax,
  MathMin,
  MathPI,
  MathPow,
  MathRandom,
  MathRound,
  MathSQRT1_2,
  MathSQRT2,
  MathSign,
  MathSin,
  MathSinh,
  MathSqrt,
  MathTan,
  MathTanh,
  MathTrunc,
} from '../../../src/primordials/math'

// MathFround and MathF16round are used to BUILD expected values inside
// `expect(...)`, so the assertion-side bindings come from the published snapshot
// via the `-stable` alias, not local `src/`.
import {
  MathF16round as ExpectedMathF16round,
  MathFround as ExpectedMathFround,
} from '@socketsecurity/lib-stable/primordials/math'

describe('Math', () => {
  it('basic math primordials', () => {
    expect(MathAbs(-3)).toBe(3)
    expect(MathCeil(1.1)).toBe(2)
    expect(MathFloor(1.9)).toBe(1)
    expect(MathMax(1, 2, 3)).toBe(3)
    expect(MathMin(1, 2, 3)).toBe(1)
    expect(MathPow(2, 8)).toBe(256)
    expect(MathRound(1.5)).toBe(2)
    expect(MathSign(-5)).toBe(-1)
    expect(MathSqrt(16)).toBe(4)
    expect(MathTrunc(1.9)).toBe(1)
  })

  it('MathRandom returns a number in [0, 1)', () => {
    const r = MathRandom()
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(1)
  })

  it('MathImul performs C-style 32-bit signed multiplication', () => {
    // `Math.imul` always coerces to int32, so its results differ from `*`
    // for values that overflow IEEE-754 safe integers.
    expect(MathImul(2, 4)).toBe(8)
    expect(MathImul(-1, 8)).toBe(-8)
    expect(MathImul(0xff_ff_ff_ff, 5)).toBe(-5)
    // 0xffff * 0xffff = 0xfffe0001 — but as int32 that's negative.
    expect(MathImul(0xff_ff, 0xff_ff)).toBe(-131_071)
  })

  it('exposes Math constants with the correct values', () => {
    expect(MathE).toBe(Math.E)
    expect(MathLN10).toBe(Math.LN10)
    expect(MathLN2).toBe(Math.LN2)
    expect(MathLOG10E).toBe(Math.LOG10E)
    expect(MathLOG2E).toBe(Math.LOG2E)
    expect(MathPI).toBe(Math.PI)
    expect(MathSQRT1_2).toBe(Math.SQRT1_2)
    expect(MathSQRT2).toBe(Math.SQRT2)
  })

  it('inverse trig: acos / asin / atan / atan2 / acosh / asinh / atanh', () => {
    expect(MathAcos(1)).toBe(0)
    expect(MathAsin(0)).toBe(0)
    expect(MathAtan(0)).toBe(0)
    expect(MathAtan2(1, 1)).toBeCloseTo(Math.PI / 4)
    expect(MathAcosh(1)).toBe(0)
    expect(MathAsinh(0)).toBe(0)
    expect(MathAtanh(0)).toBe(0)
  })

  it('forward trig: sin / cos / tan / sinh / cosh / tanh', () => {
    expect(MathSin(0)).toBe(0)
    expect(MathCos(0)).toBe(1)
    expect(MathTan(0)).toBe(0)
    expect(MathSinh(0)).toBe(0)
    expect(MathCosh(0)).toBe(1)
    expect(MathTanh(0)).toBe(0)
  })

  it('exponentials and logarithms: exp / expm1 / log / log1p / log2 / log10', () => {
    expect(MathExp(0)).toBe(1)
    expect(MathExpm1(0)).toBe(0)
    expect(MathLog(Math.E)).toBeCloseTo(1)
    expect(MathLog1p(0)).toBe(0)
    expect(MathLog2(8)).toBe(3)
    expect(MathLog10(1000)).toBe(3)
  })

  it('rooting: cbrt / hypot / fround', () => {
    expect(MathCbrt(27)).toBe(3)
    expect(MathHypot(3, 4)).toBe(5)
    // `fround` rounds to the nearest float32. 0.1 isn't exactly
    // representable in either format, but the float32 result must
    // round-trip back to the same float32 value.
    expect(MathFround(ExpectedMathFround(0.1))).toBe(ExpectedMathFround(0.1))
  })

  it('integer ops: clz32', () => {
    expect(MathClz32(1)).toBe(31)
    expect(MathClz32(0)).toBe(32)
    expect(MathClz32(0xff_ff_ff_ff)).toBe(0)
  })

  it('MathF16round is undefined or rounds to float16', () => {
    // ES2025 — undefined on older engines. When defined, rounding
    // 0.1 to float16 must round-trip the same way.
    if (typeof MathF16round !== 'function') {
      return
    }
    expect(MathF16round(ExpectedMathF16round(0.1))).toBe(
      ExpectedMathF16round(0.1),
    )
  })
})
