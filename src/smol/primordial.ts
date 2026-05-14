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

import { isNodeBuiltin } from '../node/module'

/**
 * Surface of `node:smol-primordial`. See socket-btm's
 * additions/source-patched/lib/smol-primordial.js for the canonical
 * shape.
 *
 * Each entry is registered as a `v8::CFunction` so V8 can inline the
 * C++ implementation directly into JIT-compiled callers — eliminating
 * the FunctionCallbackInfo allocation, the HandleScope, and the call-
 * site trampoline. See the C++ binding file for which signatures
 * get real wins (and which don't).
 */
export interface SmolPrimordialBinding {
  // Array.isArray. Fast path inlines a single map-pointer comparison.
  // Typed as a type predicate so callers narrow at the call site —
  // matches `Array.isArray`'s built-in `arg is any[]` signature exactly.
  arrayIsArray(v: unknown): v is unknown[]
  // Date.now. Inlines the wallclock-read into the JIT'd caller.
  dateNow(): number
  mathAbs(x: number): number
  mathAcos(x: number): number
  mathAcosh(x: number): number
  mathAsin(x: number): number
  mathAsinh(x: number): number
  mathAtan(x: number): number
  mathAtan2(a: number, b: number): number
  mathAtanh(x: number): number
  mathCbrt(x: number): number
  mathCeil(x: number): number
  mathClz32(v: number): number
  mathCos(x: number): number
  mathCosh(x: number): number
  mathExp(x: number): number
  mathExpm1(x: number): number
  mathFloor(x: number): number
  mathFround(x: number): number
  mathHypot(a: number, b: number): number
  mathImul(a: number, b: number): number
  mathLog(x: number): number
  mathLog1p(x: number): number
  mathLog2(x: number): number
  mathLog10(x: number): number
  mathPow(a: number, b: number): number
  mathRound(x: number): number
  mathSign(x: number): number
  mathSin(x: number): number
  mathSinh(x: number): number
  mathSqrt(x: number): number
  mathTan(x: number): number
  mathTanh(x: number): number
  mathTrunc(x: number): number
  numberIsFinite(v: unknown): boolean
  numberIsInteger(v: unknown): boolean
  numberIsNaN(v: unknown): boolean
  numberIsSafeInteger(v: unknown): boolean
  // ASCII-only fast paths. Two-byte strings fall back to V8's
  // slow path automatically.
  numberParseFloat(s: string): number
  // Radix 10 only. Other radices fall back to stock Number.parseInt.
  numberParseInt10(s: string): number
  // ASCII-only fast path. Returns -1 sentinel for OOB indices —
  // callers must convert to NaN to match `String.prototype.charCodeAt`
  // spec. The smol-aware export in `primordials.ts` does this
  // translation transparently.
  stringCharCodeAt(s: string, i: number): number
}

let _smolPrimordial: SmolPrimordialBinding | undefined
let _smolPrimordialProbed = false

/**
 * Returns `node:smol-primordial` when running on the smol Node
 * binary, otherwise `undefined`. Result is cached across calls.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolPrimordial(): SmolPrimordialBinding | undefined {
  if (!_smolPrimordialProbed) {
    _smolPrimordialProbed = true
    if (isNodeBuiltin('node:smol-primordial')) {
      _smolPrimordial = require('node:smol-primordial') as SmolPrimordialBinding
    }
  }
  return _smolPrimordial
}
