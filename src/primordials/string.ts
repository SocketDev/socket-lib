/**
 * @fileoverview Safe references to `String` static methods and prototype
 * methods.
 *
 * `StringPrototypeCharCodeAt` prefers the smol Fast API binding for
 * ASCII inputs (single byte load) and translates the `-1` Fast API
 * sentinel back to `NaN` to preserve spec parity. Two-byte strings
 * fall back to the uncurried `String.prototype.charCodeAt`.
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
export const StringPrototypeEndsWith = uncurryThis(String.prototype.endsWith)
export const StringPrototypeIncludes = uncurryThis(String.prototype.includes)
export const StringPrototypeIndexOf = uncurryThis(String.prototype.indexOf)
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
export const StringPrototypeToUpperCase = uncurryThis(
  String.prototype.toUpperCase,
)
export const StringPrototypeTrim = uncurryThis(String.prototype.trim)
export const StringPrototypeTrimEnd = uncurryThis(String.prototype.trimEnd)
export const StringPrototypeTrimStart = uncurryThis(String.prototype.trimStart)
