/**
 * Shallow-copy an object, then mutate the new copy's prototype to `null`.
 *
 * Object spread copies only own enumerable properties. Setting the prototype
 * mutates only the newly created copy, keeping it out of Object.prototype
 * while retaining the fast property layout of the ordinary object literal.
 * The input object is not mutated.
 */
import { ObjectSetPrototypeOf } from '../primordials/object.mjs'

export function fastNullObject<T extends object>(options?: T | undefined): T {
  // oxlint-disable-next-line socket/prefer-undefined-over-null -- null creates the required null prototype.
  return ObjectSetPrototypeOf({ ...options }, null) as T
}
