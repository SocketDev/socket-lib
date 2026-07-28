/**
 * @file Safe references to `URL`, `URLSearchParams`, and the
 *   `URLSearchParams.prototype` methods.
 */

import { uncurryThis } from './uncurry'

export const URLCtor: typeof URL = URL
export const URLSearchParamsCtor: typeof URLSearchParams = URLSearchParams

// ─── URLSearchParams (prototype) ───────────────────────────────────────
/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export const URLSearchParamsPrototypeAppend = uncurryThis(
  URLSearchParams.prototype.append,
)
/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export const URLSearchParamsPrototypeDelete = uncurryThis(
  URLSearchParams.prototype.delete,
)
export const URLSearchParamsPrototypeForEach = uncurryThis(
  URLSearchParams.prototype.forEach,
)
/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export const URLSearchParamsPrototypeGet = uncurryThis(
  URLSearchParams.prototype.get,
)
/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export const URLSearchParamsPrototypeGetAll = uncurryThis(
  URLSearchParams.prototype.getAll,
)
/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export const URLSearchParamsPrototypeHas = uncurryThis(
  URLSearchParams.prototype.has,
)
/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export const URLSearchParamsPrototypeSet = uncurryThis(
  URLSearchParams.prototype.set,
)
