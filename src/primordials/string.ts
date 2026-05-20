/**
 * @file Safe references to `String` static methods and prototype methods.
 *   `StringPrototypeCharCodeAt` prefers the smol Fast API binding for ASCII
 *   inputs (single byte load) and translates the `-1` Fast API sentinel back to
 *   `NaN` to preserve spec parity. Two-byte strings fall back to the uncurried
 *   `String.prototype.charCodeAt`.
 *
 *   ## Fast API surface — and why it's small
 *
 *   Mirrors the design rationale from socket-btm's `primordial_binding.cc`
 *   (lines 41-72). The smol Fast API exposes exactly one string op
 *   (`stringCharCodeAt`) because that's the one shape where the C++ trampoline
 *   genuinely beats V8's existing hot path: a single ASCII byte load, no
 *   encoding dispatch, no HandleScope, returns a primitive. String **searches**
 *   (`startsWith` / `endsWith` / `includes` / `indexOf` / `lastIndexOf`) are
 *   intentionally NOT exposed. V8's existing hot path dispatches on encoding
 *   and runs native SIMD memcmp — a Fast API binding would add overhead without
 *   winning. Same for `Map.has` / `Set.has` / `Array.includes`. Fast API also
 *   has a hard constraint: a fast-path function cannot return a new V8 object —
 *   only primitives, Local<Value/Object/Array>, or FastOneByteString. That
 *   rules out anything that produces a new string (`slice`, `substring`,
 *   `toUpperCase`, `concat`, `repeat`, `padStart`/`padEnd`, formatted-number)
 *   from ever being a Fast API win on the return path. Net: the current surface
 *   is approximately the ceiling. Adding more Fast API string ops without a
 *   flamegraph showing the cost is a regression risk, not a perf win. See
 *   `socket-btm/packages/node-smol-builder/additions/source-patched/`
 *   `src/socketsecurity/primordial/primordial_binding.cc:41-72` for the
 *   canonical design statement.
 */

import { getSmolPrimordial } from '../smol/primordial'

import { uncurryThis } from './uncurry'

const _smolPrimordial = getSmolPrimordial()

export const StringCtor: StringConstructor = String

// ─── String (static) ───────────────────────────────────────────────────
export const StringFromCharCode = String.fromCharCode
export const StringFromCodePoint = String.fromCodePoint
export const StringRaw = String.raw

// ─── String (prototype) ────────────────────────────────────────────────
export const StringPrototypeAt = uncurryThis(String.prototype.at)
export const StringPrototypeCharAt = uncurryThis(String.prototype.charAt)
// `stringCharCodeAt` is a Fast API binding with a FastOneByteString
// receiver — V8 only invokes the C++ fast path for ASCII strings,
// where it does a single byte load. Two-byte strings fall back.
// The fast path returns -1 for OOB indices (Fast API can't return
// NaN from an int32 signature); the wrapper here translates -1 back
// to NaN to match `String.prototype.charCodeAt` spec.
const _smolCharCodeAt = _smolPrimordial?.stringCharCodeAt
// _smolCharCodeAt fast-path fires only on socket-btm's smol Node binary.
/* c8 ignore start */
export const StringPrototypeCharCodeAt: (s: string, i: number) => number =
  _smolCharCodeAt
    ? (s, i) => {
        const code = _smolCharCodeAt(s, i)
        return code === -1 ? NaN : code
      }
    : uncurryThis(String.prototype.charCodeAt)
/* c8 ignore stop */
export const StringPrototypeCodePointAt = uncurryThis(
  String.prototype.codePointAt,
)
export const StringPrototypeConcat = uncurryThis(String.prototype.concat) as (
  self: string,
  ...strs: string[]
) => string
// Why uncurried, not Fast-API'd: see the fileoverview JSDoc above.
// V8's existing hot path beats trampoline overhead on these.
export const StringPrototypeEndsWith = uncurryThis(String.prototype.endsWith)
export const StringPrototypeIncludes = uncurryThis(String.prototype.includes)
export const StringPrototypeIndexOf = uncurryThis(String.prototype.indexOf)
// ES2024 — validates that the string contains no lone surrogates.
// Routes through `node:smol-primordial` on the smol Node binary (ASCII
// fast path returns true unconditionally without an O(n) scan).
export const StringPrototypeIsWellFormed: (s: string) => boolean =
  _smolPrimordial?.stringIsWellFormed ??
  uncurryThis(String.prototype.isWellFormed)
export const StringPrototypeLastIndexOf = uncurryThis(
  String.prototype.lastIndexOf,
)
export const StringPrototypeLocaleCompare = uncurryThis(
  String.prototype.localeCompare,
)
export const StringPrototypeMatch = uncurryThis(
  String.prototype.match as (
    this: string,
    matcher: string | RegExp,
  ) => RegExpMatchArray | null,
)
export const StringPrototypeMatchAll = uncurryThis(
  String.prototype.matchAll as (
    this: string,
    matcher: RegExp | string,
  ) => IterableIterator<RegExpMatchArray>,
)
export const StringPrototypeNormalize = uncurryThis(String.prototype.normalize)
export const StringPrototypePadEnd = uncurryThis(String.prototype.padEnd)
export const StringPrototypePadStart = uncurryThis(String.prototype.padStart)
export const StringPrototypeRepeat = uncurryThis(String.prototype.repeat)
export const StringPrototypeReplace = uncurryThis(
  String.prototype.replace as (
    this: string,
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: any[]) => string),
  ) => string,
)
export const StringPrototypeReplaceAll = uncurryThis(
  String.prototype.replaceAll as (
    this: string,
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: any[]) => string),
  ) => string,
)
export const StringPrototypeSearch = uncurryThis(String.prototype.search)
export const StringPrototypeSlice = uncurryThis(String.prototype.slice)
export const StringPrototypeSplit = uncurryThis(String.prototype.split) as (
  self: string,
  separator: string | RegExp,
  limit?: number,
) => string[]
export const StringPrototypeStartsWith = uncurryThis(
  String.prototype.startsWith,
)
export const StringPrototypeSubstring = uncurryThis(String.prototype.substring)
export const StringPrototypeToLocaleLowerCase = uncurryThis(
  String.prototype.toLocaleLowerCase,
)
export const StringPrototypeToLocaleUpperCase = uncurryThis(
  String.prototype.toLocaleUpperCase,
)
export const StringPrototypeToLowerCase = uncurryThis(
  String.prototype.toLowerCase,
)
export const StringPrototypeToString = uncurryThis(String.prototype.toString)
export const StringPrototypeToUpperCase = uncurryThis(
  String.prototype.toUpperCase,
)
// ES2024 — returns a copy of the string with lone surrogates replaced by U+FFFD.
export const StringPrototypeToWellFormed = uncurryThis(
  String.prototype.toWellFormed,
)
export const StringPrototypeTrim = uncurryThis(String.prototype.trim)
export const StringPrototypeTrimEnd = uncurryThis(String.prototype.trimEnd)
export const StringPrototypeTrimStart = uncurryThis(String.prototype.trimStart)
export const StringPrototypeValueOf = uncurryThis(String.prototype.valueOf)
