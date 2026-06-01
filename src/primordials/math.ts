/**
 * @file Safe references to `Math` constants and methods. Methods prefer the
 *   smol fast-path (`node:smol-primordial`) when available — V8 Fast API typed
 *   implementations TurboFan inlines into JIT'd callers. Constants stay as the
 *   stock `Math.X` since they are pre-computed scalar values with no fast-path
 *   benefit.
 */

import { getSmolPrimordial } from '../smol/primordial'

const _smolPrimordial = getSmolPrimordial()

// ─── Math (constants) ──────────────────────────────────────────────────
export const MathE = Math.E
export const MathLN2 = Math.LN2
export const MathLN10 = Math.LN10
export const MathLOG2E = Math.LOG2E
export const MathLOG10E = Math.LOG10E
export const MathPI = Math.PI
export const MathSQRT1_2 = Math.SQRT1_2
export const MathSQRT2 = Math.SQRT2

// ─── Math (methods) ────────────────────────────────────────────────────
// Each entry prefers `_smolPrimordial.mathX` when running on the smol
// Node binary (V8 Fast API typed implementation, TurboFan-inlinable),
// falling back to `Math.x` on stock Node + non-Node runtimes. Math
// constants don't get fast-pathed (no benefit — they're already
// pre-computed scalar values).
export const MathAbs = _smolPrimordial?.mathAbs ?? Math.abs
export const MathAcos = _smolPrimordial?.mathAcos ?? Math.acos
export const MathAcosh = _smolPrimordial?.mathAcosh ?? Math.acosh
export const MathAsin = _smolPrimordial?.mathAsin ?? Math.asin
export const MathAsinh = _smolPrimordial?.mathAsinh ?? Math.asinh
export const MathAtan = _smolPrimordial?.mathAtan ?? Math.atan
export const MathAtan2 = _smolPrimordial?.mathAtan2 ?? Math.atan2
export const MathAtanh = _smolPrimordial?.mathAtanh ?? Math.atanh
export const MathCbrt = _smolPrimordial?.mathCbrt ?? Math.cbrt
export const MathCeil = _smolPrimordial?.mathCeil ?? Math.ceil
export const MathClz32 = _smolPrimordial?.mathClz32 ?? Math.clz32
export const MathCos = _smolPrimordial?.mathCos ?? Math.cos
export const MathCosh = _smolPrimordial?.mathCosh ?? Math.cosh
export const MathExp = _smolPrimordial?.mathExp ?? Math.exp
export const MathExpm1 = _smolPrimordial?.mathExpm1 ?? Math.expm1
// `Math.f16round` is ES2025 (Node 22+ / V8 12.x). Older engines lack
// it; the runtime check keeps us undefined-safe instead of crashing
// at import time. No smol fast-path yet (would need a separate ES2025
// type signature in the binding).
export const MathF16round: ((value: number) => number) | undefined = (
  Math as { f16round?: ((value: number) => number) | undefined }
).f16round
export const MathFloor = _smolPrimordial?.mathFloor ?? Math.floor
export const MathFround = _smolPrimordial?.mathFround ?? Math.fround
export const MathHypot = _smolPrimordial?.mathHypot ?? Math.hypot
export const MathImul = _smolPrimordial?.mathImul ?? Math.imul
export const MathLog = _smolPrimordial?.mathLog ?? Math.log
export const MathLog1p = _smolPrimordial?.mathLog1p ?? Math.log1p
export const MathLog2 = _smolPrimordial?.mathLog2 ?? Math.log2
export const MathLog10 = _smolPrimordial?.mathLog10 ?? Math.log10
// Math.max / Math.min are variadic. The smol fast path only specializes
// the 2-arg case at the C++ level; variadic callers fall back to
// Math.max/min anyway via V8's slow-path machinery. Stick with the
// stock builtins here — they're already V8-inlined for the common 2-arg
// case via type feedback.
export const MathMax = Math.max
export const MathMin = Math.min
export const MathPow = _smolPrimordial?.mathPow ?? Math.pow
// Math.random doesn't fit a fast-path shape (no args, side-effecting
// PRNG state). Stock builtin is already V8-inlined.
export const MathRandom = Math.random
export const MathRound = _smolPrimordial?.mathRound ?? Math.round
export const MathSign = _smolPrimordial?.mathSign ?? Math.sign
export const MathSin = _smolPrimordial?.mathSin ?? Math.sin
export const MathSinh = _smolPrimordial?.mathSinh ?? Math.sinh
export const MathSqrt = _smolPrimordial?.mathSqrt ?? Math.sqrt
export const MathTan = _smolPrimordial?.mathTan ?? Math.tan
export const MathTanh = _smolPrimordial?.mathTanh ?? Math.tanh
export const MathTrunc = _smolPrimordial?.mathTrunc ?? Math.trunc
