/**
 * @file Safe references to the Fetch `Headers` constructor and its
 *   `Headers.prototype` methods. `Headers` is a global on Node 22+ (Socket's
 *   floor), captured unguarded like `URL` / `URLSearchParams`.
 */

import { uncurryThis } from './uncurry'

/**
 * @unused No internal or Socket consumers.
 */
export const HeadersCtor: typeof Headers = Headers

// ─── Headers (prototype) ───────────────────────────────────────────────
export const HeadersPrototypeForEach = uncurryThis(Headers.prototype.forEach)
/**
 * @unused No internal or Socket consumers.
 */
export const HeadersPrototypeGet = uncurryThis(Headers.prototype.get)
/**
 * @unused No internal or Socket consumers.
 */
export const HeadersPrototypeHas = uncurryThis(Headers.prototype.has)
/**
 * @unused No internal or Socket consumers.
 */
export const HeadersPrototypeSet = uncurryThis(Headers.prototype.set)
