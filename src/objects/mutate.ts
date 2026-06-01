/**
 * @file Object mutation helpers — `merge` (deep recursive), `objectAssign`
 *   (alias for native), `objectFreeze` (alias for native). `merge` includes
 *   infinite-loop detection via `LOOP_SENTINEL` because `__proto__` and
 *   self-referential graphs would otherwise blow the stack on a recursive
 *   descent.
 */

import { LOOP_SENTINEL } from '../constants/sentinels'
import { isArray } from '../arrays/predicates'
import { ErrorCtor } from '../primordials/error'
import { ReflectOwnKeys } from '../primordials/reflect'

import { isObject } from './predicates'

/**
 * Deep merge source object into target object.
 *
 * Recursively merges properties from `source` into `target`. Arrays in source
 * completely replace arrays in target (no element-wise merging). Objects are
 * merged recursively. Includes infinite loop detection for safety.
 *
 * @example
 *   ;```ts
 *   merge(
 *     { config: { api: 'v1', timeout: 1000 } },
 *     { config: { api: 'v2', retries: 3 } },
 *   )
 *   // { config: { api: 'v2', timeout: 1000, retries: 3 } }
 *   ```
 *
 * @example
 *   ;```ts
 *   // Arrays are replaced, not merged
 *   merge({ arr: [1, 2] }, { arr: [3] }) // { arr: [3] }
 *   ```
 *
 * @param target - The object to merge into (will be modified)
 * @param source - The object to merge from.
 *
 * @returns The modified target object
 */
export function merge<T extends object, U extends object>(
  target: T,
  source: U,
): T & U {
  if (!isObject(target) || !isObject(source)) {
    return target as T & U
  }
  const queue: Array<[unknown, unknown]> = [[target, source]]
  let pos = 0
  let { length: queueLength } = queue
  while (pos < queueLength) {
    if (pos === LOOP_SENTINEL) {
      throw new ErrorCtor('Detected infinite loop in object crawl of merge')
    }
    const { 0: currentTarget, 1: currentSource } = queue[pos++] as [
      Record<PropertyKey, unknown>,
      Record<PropertyKey, unknown>,
    ]

    if (!currentSource || !currentTarget) {
      continue
    }

    const isSourceArray = isArray(currentSource)
    const isTargetArray = isArray(currentTarget)

    // Skip array merging - arrays in source replace arrays in target
    if (isSourceArray || isTargetArray) {
      continue
    }

    const keys = ReflectOwnKeys(currentSource as object)
    for (let i = 0, { length } = keys; i < length; i += 1) {
      const key = keys[i] as PropertyKey
      const srcVal = currentSource[key]
      const targetVal = currentTarget[key]
      if (isArray(srcVal)) {
        // Replace arrays entirely
        currentTarget[key] = srcVal
      } else if (isObject(srcVal)) {
        if (isObject(targetVal) && !isArray(targetVal)) {
          queue[queueLength++] = [targetVal, srcVal]
        } else {
          currentTarget[key] = srcVal
        }
      } else {
        currentTarget[key] = srcVal
      }
    }
  }
  return target as T & U
}

// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3

/**
 * Alias for native `Object.assign`.
 *
 * Copies all enumerable own properties from one or more source objects to a
 * target object and returns the modified target object.
 *
 * @example
 *   ;```ts
 *   objectAssign({ a: 1 }, { b: 2 }) // { a: 1, b: 2 }
 *   ```
 */
export const objectAssign = Object.assign

/**
 * Alias for native `Object.freeze`.
 *
 * Freezes an object, preventing new properties from being added and existing
 * properties from being removed or modified. Makes the object immutable.
 *
 * @example
 *   ;```ts
 *   const obj = { a: 1 }
 *   objectFreeze(obj)
 *   obj.a = 2 // Silently fails (or throws in strict mode)
 *   ```
 */
export const objectFreeze = Object.freeze
