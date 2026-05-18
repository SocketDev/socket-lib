/**
 * @file Safe references to `RegExp` and its prototype methods. `RegExp.escape`
 *   is ES2025; the primordial is typed `Function | undefined` so older runtimes
 *   still load. The Symbol-keyed `[Symbol.match]` / `[Symbol.replace]` slots
 *   are exposed alongside the named methods because some callers use them via
 *   dynamic dispatch (e.g. `String.prototype.match` invokes
 *   `RegExp.prototype[Symbol.match]` internally).
 */

import { uncurryThis } from './uncurry'

export const RegExpCtor: RegExpConstructor = RegExp

// ─── RegExp (static) ───────────────────────────────────────────────────
// `RegExp.escape` is ES2025 (Node 22.18+). Typed `Function | undefined`
// for safety even though Node 22.18+ always has it. Callers needing a
// portable shape should null-check.
export const RegExpEscape: ((s: string) => string) | undefined = (
  RegExp as { escape?: (s: string) => string }
).escape

// ─── RegExp (prototype) ────────────────────────────────────────────────
export const RegExpPrototypeExec = uncurryThis(RegExp.prototype.exec)
export const RegExpPrototypeTest = uncurryThis(RegExp.prototype.test)
export const RegExpPrototypeSymbolMatch = uncurryThis(
  RegExp.prototype[Symbol.match] as (this: RegExp, str: string) => unknown,
)
export const RegExpPrototypeSymbolReplace = uncurryThis(
  RegExp.prototype[Symbol.replace] as (
    this: RegExp,
    str: string,
    replaceValue: string,
  ) => string,
)
