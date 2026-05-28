/**
 * @file Safe references to `Number`, its constants, predicates, and parse
 *   helpers. Predicates prefer the smol fast-path (`node:smol-primordial`);
 *   static `parseFloat` / `parseInt` use the FastOneByteString-typed bindings
 *   for ASCII inputs and fall back to stock `Number.parse*` otherwise.
 */

import { getSmolPrimordial } from '../smol/primordial'

import { uncurryThis } from './uncurry'

const _smolPrimordial = getSmolPrimordial()

export const NumberCtor: NumberConstructor = Number

// ─── Number (constants) ────────────────────────────────────────────────
export const NumberEPSILON = Number.EPSILON
export const NumberMAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
export const NumberMAX_VALUE = Number.MAX_VALUE
export const NumberMIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER
export const NumberMIN_VALUE = Number.MIN_VALUE
export const NumberNEGATIVE_INFINITY = Number.NEGATIVE_INFINITY
export const NumberPOSITIVE_INFINITY = Number.POSITIVE_INFINITY

// ─── Number (methods) ──────────────────────────────────────────────────
// Predicates prefer the smol fast-path; static parse* keep the stock
// builtins (their fast paths require Local<String> handling, deferred
// to a future binding extension).
export const NumberIsFinite = _smolPrimordial?.numberIsFinite ?? Number.isFinite
export const NumberIsInteger =
  _smolPrimordial?.numberIsInteger ?? Number.isInteger
export const NumberIsNaN = _smolPrimordial?.numberIsNaN ?? Number.isNaN
export const NumberIsSafeInteger =
  _smolPrimordial?.numberIsSafeInteger ?? Number.isSafeInteger
// `numberParseFloat` and `numberParseInt10` are FastOneByteString-typed
// bindings — V8 only invokes the C++ fast path when the input string
// is sequential one-byte (ASCII). Two-byte strings, BigInt-as-string,
// etc. fall through to the slow path automatically. parseInt is
// specialized to radix 10 because every parseInt site in this repo
// (and in socket-cli) uses `parseInt(s, 10)`. The wrapper below
// preserves the "missing radix" and "radix !== 10" cases by routing
// to stock Number.parseInt — only radix 10 (or omitted) hits the
// Fast API path.
export const NumberParseFloat =
  _smolPrimordial?.numberParseFloat ?? Number.parseFloat
const _smolParseInt10 = _smolPrimordial?.numberParseInt10
// _smolParseInt10 fast-path fires only on socket-btm's smol Node binary;
// stock Node falls through to Number.parseInt.
/* c8 ignore start */
export const NumberParseInt: typeof Number.parseInt = _smolParseInt10
  ? (s, radix) =>
      radix === undefined || radix === 10
        ? _smolParseInt10(s as string)
        : NumberParseInt(s, radix)
  : Number.parseInt
/* c8 ignore stop */
export const NumberPrototypeToExponential = uncurryThis(
  Number.prototype.toExponential,
)
export const NumberPrototypeToFixed = uncurryThis(Number.prototype.toFixed)
export const NumberPrototypeToPrecision = uncurryThis(
  Number.prototype.toPrecision,
)
export const NumberPrototypeToString = uncurryThis(Number.prototype.toString)
export const NumberPrototypeValueOf = uncurryThis(Number.prototype.valueOf)
