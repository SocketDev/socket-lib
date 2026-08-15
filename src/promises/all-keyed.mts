/**
 * @file Keyed promise combinators: `pAllKeyed` and `pAllSettledKeyed` — the
 *   tc39 proposal-await-dictionary (`Promise.allKeyed` /
 *   `Promise.allSettledKeyed`, stage 3) as plain helpers, no global
 *   patching. Spec-faithful where it counts:
 *
 *   - Keys are the dictionary's OWN ENUMERABLE properties in
 *     `[[OwnPropertyKeys]]` order, INCLUDING enumerable symbols (where
 *     Bluebird.props / p-props stop at string keys).
 *   - Each value goes through `Promise.resolve`, so plain values and thenables
 *     both work.
 *   - The result is a NULL-PROTOTYPE object
 *     (CreateKeyedPromiseCombinatorResultObject does
 *     OrdinaryObjectCreate(null)) carrying the same keys.
 *   - `pAllKeyed` rejects on the first rejection with every promise already
 *     subscribed — no unhandled-rejection stragglers. `pAllSettledKeyed` always
 *     resolves, each key carrying a `{ status, value | reason }` settled
 *     record.
 */

import { ObjectGetOwnPropertyDescriptor } from '../primordials/object.mjs'
import {
  PromiseAll,
  PromiseAllSettled,
  PromiseResolve,
} from '../primordials/promise.mjs'
import { ReflectOwnKeys } from '../primordials/reflect.mjs'

export type AwaitedDictionary<D> = {
  [K in keyof D]: Awaited<D[K]>
}

export type SettledDictionary<D> = {
  [K in keyof D]: PromiseSettledResult<Awaited<D[K]>>
}

/**
 * The dictionary's own enumerable property keys (strings AND symbols) in
 * `[[OwnPropertyKeys]]` order, paired with their values resolved to
 * promises. Shared walk for both combinators so key semantics cannot
 * drift between them.
 */
export function enumerableEntries(
  promises: object,
): Array<{ key: PropertyKey; promise: Promise<unknown> }> {
  const keys = ReflectOwnKeys(promises)
  const entries: Array<{ key: PropertyKey; promise: Promise<unknown> }> = []
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    const desc = ObjectGetOwnPropertyDescriptor(promises, key)
    if (desc?.enumerable) {
      entries.push({
        key,
        promise: PromiseResolve(
          (promises as Record<PropertyKey, unknown>)[key],
        ),
      })
    }
  }
  return entries
}

/**
 * Await a dictionary of promises by KEY instead of by position — the
 * `Promise.allKeyed` shape. Rejects on the first rejection (with every
 * value already subscribed, so no unhandled rejections); resolves to a
 * null-prototype object with the same keys and awaited values.
 *
 * @example
 *   const { shape, color, mass } = await pAllKeyed({
 *     shape: getShape(),
 *     color: getColor(),
 *     mass: getMass(),
 *   })
 */
export async function pAllKeyed<D extends object>(
  promises: D,
): Promise<AwaitedDictionary<D>> {
  requireObject(promises)
  const entries = enumerableEntries(promises)
  const values = await PromiseAll(entries.map(e => e.promise))
  const result = { __proto__: null } as unknown as AwaitedDictionary<D>
  for (let i = 0, { length } = entries; i < length; i += 1) {
    ;(result as Record<PropertyKey, unknown>)[entries[i]!.key] = values[i]
  }
  return result
}

/**
 * The `Promise.allSettledKeyed` shape: always resolves, each key carrying
 * its `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`
 * settled record, on a null-prototype object with the same keys.
 *
 * @example
 *   const results = await pAllSettledKeyed({ shape: getShape() })
 *   if (results.shape.status === 'fulfilled') {
 *     use(results.shape.value)
 *   }
 */
export async function pAllSettledKeyed<D extends object>(
  promises: D,
): Promise<SettledDictionary<D>> {
  requireObject(promises)
  const entries = enumerableEntries(promises)
  const settled = await PromiseAllSettled(entries.map(e => e.promise))
  const result = { __proto__: null } as unknown as SettledDictionary<D>
  for (let i = 0, { length } = entries; i < length; i += 1) {
    ;(result as Record<PropertyKey, unknown>)[entries[i]!.key] = settled[i]
  }
  return result
}

export function requireObject(promises: unknown): asserts promises is object {
  // Functions ARE objects in the spec's sense ([[OwnPropertyKeys]] works on
  // them); only primitives and null are rejected.
  if (
    promises === null ||
    (typeof promises !== 'object' && typeof promises !== 'function')
  ) {
    throw new TypeError(
      `pAllKeyed / pAllSettledKeyed take a dictionary object. Saw ${promises === null ? 'null' : typeof promises}, wanted an object whose values are promises (or plain values). Fix: pass e.g. { shape: getShape(), color: getColor() }.`,
    )
  }
}
