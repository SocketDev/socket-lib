/**
 * @file Safe references to the Fetch `Headers` constructor and its
 *   `Headers.prototype` methods. `Headers` is a global on Node 22+ (the fleet
 *   floor), captured unguarded like `URL` / `URLSearchParams`.
 */

import { uncurryThis } from './uncurry'

export const HeadersCtor: typeof Headers = Headers

// ─── Headers (prototype) ───────────────────────────────────────────────
export const HeadersPrototypeForEach = uncurryThis(Headers.prototype.forEach)
export const HeadersPrototypeGet = uncurryThis(Headers.prototype.get)
export const HeadersPrototypeHas = uncurryThis(Headers.prototype.has)
export const HeadersPrototypeSet = uncurryThis(Headers.prototype.set)
