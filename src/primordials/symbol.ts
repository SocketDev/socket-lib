/**
 * @file Safe references to `Symbol`, well-known symbols, and
 *   `Symbol.prototype`. `Symbol.asyncDispose` and `Symbol.dispose` are ES2024
 *   (Node 20.4+); older engines lack them and the references resolve to
 *   `undefined`. `SymbolPrototypeDescription` wraps the accessor since
 *   `description` is a getter on `Symbol.prototype`, not a method.
 */

import { uncurryThis } from './uncurry'

export const SymbolCtor: SymbolConstructor = Symbol

// ─── Symbol (static) ───────────────────────────────────────────────────
// `Symbol.asyncDispose` and `Symbol.dispose` are ES2024 (Node 20.4+).
// Older engines lack them; use `| undefined` so importers don't crash
// at load time.
export const SymbolAsyncDispose: typeof Symbol.asyncDispose | undefined = (
  Symbol as { asyncDispose?: typeof Symbol.asyncDispose | undefined }
).asyncDispose
export const SymbolAsyncIterator = Symbol.asyncIterator
export const SymbolDispose: typeof Symbol.dispose | undefined = (
  Symbol as { dispose?: typeof Symbol.dispose | undefined }
).dispose
export const SymbolFor = Symbol.for
export const SymbolHasInstance = Symbol.hasInstance
export const SymbolIsConcatSpreadable = Symbol.isConcatSpreadable
export const SymbolIterator = Symbol.iterator
export const SymbolKeyFor = Symbol.keyFor
export const SymbolMatch = Symbol.match
export const SymbolMatchAll = Symbol.matchAll
export const SymbolReplace = Symbol.replace
export const SymbolSearch = Symbol.search
export const SymbolSpecies = Symbol.species
export const SymbolSplit = Symbol.split
export const SymbolToPrimitive = Symbol.toPrimitive
export const SymbolToStringTag = Symbol.toStringTag
export const SymbolUnscopables = Symbol.unscopables

// ─── Symbol (prototype) ────────────────────────────────────────────────
// `description` is an accessor on `Symbol.prototype`, not a method.
// `__lookupGetter__` resolves it cleanly across engines without
// touching the live property descriptor.
const symbolDescriptionGetter = (
  Symbol.prototype as unknown as {
    __lookupGetter__: (key: string) => (() => string | undefined) | undefined
  }
).__lookupGetter__('description')
export function SymbolPrototypeDescription(self: symbol): string | undefined {
  // symbolDescriptionGetter is always set in modern V8.
  /* c8 ignore start - description getter is always present in modern V8; the fallback branch is unreachable */
  return symbolDescriptionGetter
    ? symbolDescriptionGetter.call(self)
    : self.description
  /* c8 ignore stop */
}
export const SymbolPrototypeToString = uncurryThis(Symbol.prototype.toString)
export const SymbolPrototypeValueOf = uncurryThis(Symbol.prototype.valueOf) as (
  self: symbol,
) => symbol
