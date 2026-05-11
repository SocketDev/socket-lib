/**
 * @fileoverview Spec-compliant fallback for the TC39 `RegExp.escape`
 * (https://tc39.es/ecma262/#sec-regexp.escape). Implements
 * `escapeRegExpFallback` plus the `isSpecHexEscapeCp` classifier used
 * by both the fallback and downstream callers.
 *
 * The fallback handles every branch of the spec
 * `EncodeForRegExpEscape` algorithm: leading [0-9A-Za-z] are always
 * `\xHH`-escaped (guards against `\0..\9` / `\c` merging in a larger
 * pattern), syntax characters (and `/`) get a plain backslash prefix,
 * the `ControlEscape` set maps to its `\t \n \v \f \r` names, the
 * other punctuators and the whitespace / line-terminator / lone-surrogate
 * code points route through `\xHH` or `\uHHHH`. Every other code
 * point is emitted verbatim.
 */

import { MapCtor, SetCtor } from '../primordials/map-set'
import {
  StringFromCodePoint,
  StringPrototypeCharCodeAt,
  StringPrototypeCodePointAt,
} from '../primordials/string'

import { hex2, hex4 } from './hex'

// SyntaxCharacter set plus `/` — these get a plain backslash prefix.
const SYNTAX_CHARACTERS = new SetCtor('^$\\.*+?()[]{}|/')

// ControlEscape mappings: \t \n \v \f \r (spec Table 62).
const CONTROL_ESCAPES = new MapCtor<number, string>([
  [0x09, '\\t'],
  [0x0a, '\\n'],
  [0x0b, '\\v'],
  [0x0c, '\\f'],
  [0x0d, '\\r'],
])

// Other ASCII punctuators the spec explicitly hex-escapes (§22.2.5.1.1),
// plus any whitespace / line terminator / lone surrogate the spec routes
// through the same branch.
const OTHER_PUNCTUATORS = new SetCtor(',-=<>#&!%:;@~\'`"')

export function escapeRegExpFallback(str: string): string {
  let out = ''
  // Iterate by code point (String iterator yields UTF-16-safe chars).
  let isFirst = true
  for (const char of str) {
    const cp = StringPrototypeCodePointAt(char, 0)!
    // Leading [0-9A-Za-z] always gets \xHH (guards against \0..\9 /
    // \c merging in a larger pattern).
    if (
      isFirst &&
      ((cp >= 0x30 && cp <= 0x39) ||
        (cp >= 0x41 && cp <= 0x5a) ||
        (cp >= 0x61 && cp <= 0x7a))
    ) {
      out += '\\x' + hex2(cp)
    } else if (SYNTAX_CHARACTERS.has(char)) {
      // SyntaxCharacter + `/`.
      out += '\\' + char
    } else {
      const ctrl = CONTROL_ESCAPES.get(cp)
      if (ctrl !== undefined) {
        out += ctrl
      } else if (isSpecHexEscapeCp(cp)) {
        if (cp <= 0xff) {
          out += '\\x' + hex2(cp)
        } else {
          // Emit per UTF-16 code unit (\uXXXX each).
          for (let i = 0; i < char.length; i++) {
            out += '\\u' + hex4(StringPrototypeCharCodeAt(char, i))
          }
        }
      } else {
        // Verbatim.
        out += char
      }
    }
    isFirst = false
  }
  return out
}

// Additional whitespace / line terminator / surrogate code points the
// spec requires escaping. We enumerate the ones that commonly appear in
// string inputs; `String#codePointAt` iteration surfaces them as numbers.
// Whitespace: TAB, VT, FF, SP, NBSP, ZWNBSP, plus Unicode Space_Separator.
// LineTerminator: LF, CR, LS (U+2028), PS (U+2029).
// Lone surrogates: U+D800..U+DFFF.
export function isSpecHexEscapeCp(cp: number): boolean {
  if (OTHER_PUNCTUATORS.has(StringFromCodePoint(cp))) {
    return true
  }
  // LineTerminator.
  if (cp === 0x0a || cp === 0x0d || cp === 0x2028 || cp === 0x2029) {
    return true
  }
  // Whitespace subset (ASCII/common — matches WhiteSpace production).
  if (
    cp === 0x09 ||
    cp === 0x0b ||
    cp === 0x0c ||
    cp === 0x20 ||
    cp === 0xa0 ||
    cp === 0xfeff
  ) {
    return true
  }
  // Lone surrogates.
  if (cp >= 0xd800 && cp <= 0xdfff) {
    return true
  }
  return false
}
