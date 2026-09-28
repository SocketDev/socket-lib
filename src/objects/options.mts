/**
 * Copy an options object into a null-prototype object with fast properties.
 *
 * Object spread copies only own enumerable properties. Setting the prototype
 * after construction keeps the result out of Object.prototype while retaining
 * the fast property layout of the ordinary object literal.
 */
import { ObjectSetPrototypeOf } from '../primordials/object.mjs'

export function createFastOptions<T extends object>(
  options?: T | undefined,
): T {
  // oxlint-disable-next-line socket/prefer-undefined-over-null -- null creates the required null prototype.
  return ObjectSetPrototypeOf({ ...options }, null) as T
}
