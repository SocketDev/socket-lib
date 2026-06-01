/**
 * @file Safe references to `Date`. `DateNow` prefers the smol Fast API binding
 *   (single-byte wallclock read inlined into JIT'd callers) when available;
 *   stock Node falls back to `Date.now`.
 */

import { getSmolPrimordial } from '../smol/primordial'

import { uncurryThis } from './uncurry'

const smolPrimordial = getSmolPrimordial()

export const DateCtor: DateConstructor = Date

// ─── Date (static) ─────────────────────────────────────────────────────
// `dateNow` Fast API binding inlines the wallclock-read into JIT'd
// callers — meaningful win in tight monitoring loops where Date.now()
// is called millions of times/sec for performance traces.
export const DateNow = smolPrimordial?.dateNow ?? Date.now
export const DateParse = Date.parse
export const DateUTC = Date.UTC

// ─── Date (prototype) ──────────────────────────────────────────────────
export const DatePrototypeGetTime = uncurryThis(Date.prototype.getTime)
export const DatePrototypeToISOString = uncurryThis(Date.prototype.toISOString)
export const DatePrototypeToLocaleString = uncurryThis(
  Date.prototype.toLocaleString,
)
export const DatePrototypeValueOf = uncurryThis(Date.prototype.valueOf)
