/**
 * @file Safe references to `URL`, `URLSearchParams`, and the
 *   `URLSearchParams.prototype` methods.
 */

import { uncurryThis } from './uncurry'

export const URLCtor: typeof URL = URL
export const URLSearchParamsCtor: typeof URLSearchParams = URLSearchParams

// ─── URLSearchParams (prototype) ───────────────────────────────────────
export const URLSearchParamsPrototypeAppend = uncurryThis(
  URLSearchParams.prototype.append,
)
export const URLSearchParamsPrototypeDelete = uncurryThis(
  URLSearchParams.prototype.delete,
)
export const URLSearchParamsPrototypeForEach = uncurryThis(
  URLSearchParams.prototype.forEach,
)
export const URLSearchParamsPrototypeGet = uncurryThis(
  URLSearchParams.prototype.get,
)
export const URLSearchParamsPrototypeGetAll = uncurryThis(
  URLSearchParams.prototype.getAll,
)
export const URLSearchParamsPrototypeHas = uncurryThis(
  URLSearchParams.prototype.has,
)
export const URLSearchParamsPrototypeSet = uncurryThis(
  URLSearchParams.prototype.set,
)
