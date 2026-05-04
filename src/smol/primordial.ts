/**
 * @fileoverview Lazy-loader for socket-btm's `node:smol-primordial`
 * binding.
 *
 * `node:smol-primordial` provides V8 Fast API typed implementations
 * of Math.* and Number.is* primordials, registered with
 * `CFunction::Make()` so TurboFan inlines them directly into JIT-
 * compiled JS callers. Bypasses the FunctionCallbackInfo trampoline
 * entirely — ~30-50% gain on hot loops where V8 doesn't already
 * auto-inline.
 *
 * Returns `undefined` on stock Node + non-Node runtimes. Result is
 * cached across calls.
 *
 * @internal — used by `src/primordials.ts` to resolve smol-aware
 *   Math.* / Number.is* fast paths. Most callers should use the
 *   standard `primordials` exports, which already route through this
 *   when smol is present.
 *
 * @see https://v8.dev/blog/v8-release-99 — V8 Fast API Calls overview
 */

import { isSmol } from './util'

/**
 * Surface of `node:smol-primordial`. See socket-btm's
 * additions/source-patched/lib/smol-primordial.js for the canonical
 * shape. All entries are V8 Fast API typed — TurboFan inlines them
 * into JIT-compiled callers.
 */
export interface SmolPrimordialBinding {
  // Math (unary, double → double).
  mathAbs(x: number): number
  mathAcos(x: number): number
  mathAcosh(x: number): number
  mathAsin(x: number): number
  mathAsinh(x: number): number
  mathAtan(x: number): number
  mathAtanh(x: number): number
  mathCbrt(x: number): number
  mathCeil(x: number): number
  mathCos(x: number): number
  mathCosh(x: number): number
  mathExp(x: number): number
  mathExpm1(x: number): number
  mathFloor(x: number): number
  mathFround(x: number): number
  mathLog(x: number): number
  mathLog1p(x: number): number
  mathLog2(x: number): number
  mathLog10(x: number): number
  mathRound(x: number): number
  mathSign(x: number): number
  mathSin(x: number): number
  mathSinh(x: number): number
  mathSqrt(x: number): number
  mathTan(x: number): number
  mathTanh(x: number): number
  mathTrunc(x: number): number
  // Math (binary).
  mathAtan2(a: number, b: number): number
  mathHypot(a: number, b: number): number
  mathPow(a: number, b: number): number
  // Math (other signatures).
  mathClz32(v: number): number
  mathImul(a: number, b: number): number
  // Number predicates.
  numberIsFinite(v: unknown): boolean
  numberIsInteger(v: unknown): boolean
  numberIsNaN(v: unknown): boolean
  numberIsSafeInteger(v: unknown): boolean
}

let _smolPrimordial: SmolPrimordialBinding | null | undefined

/**
 * Returns `node:smol-primordial` when running on the smol Node
 * binary, otherwise `undefined`. Result is cached across calls.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolPrimordial(): SmolPrimordialBinding | undefined {
  if (_smolPrimordial === undefined) {
    if (isSmol()) {
      try {
        _smolPrimordial =
          require('node:smol-primordial') as SmolPrimordialBinding
      } catch {
        _smolPrimordial = null
      }
    } else {
      _smolPrimordial = null
    }
  }
  return _smolPrimordial ?? undefined
}
