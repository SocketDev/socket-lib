/**
 * @file `Memoize` — class-method decorator that wraps the decorated method via
 *   `memoize`. Preserves `this`-context by installing the wrapper on the
 *   property descriptor. Defaults the cache `name` option to the property key
 *   for nicer debug output.
 */

import { memoize } from './memoize.mjs'

import type { MemoizeOptions } from './types.mjs'

/**
 * Create a memoized version of a method. Preserves 'this' context for class
 * methods.
 *
 * @example
 *   import { Memoize } from '@socketsecurity/lib/memo/decorator'
 *
 *   class Calculator {
 *     @Memoize()
 *     fibonacci(n: number): number {
 *       if (n <= 1) return n
 *       return this.fibonacci(n - 1) + this.fibonacci(n - 2)
 *     }
 *   }
 *
 * @param target - Object containing the method.
 * @param propertyKey - Method name.
 * @param descriptor - Property descriptor.
 *
 * @returns Modified descriptor with memoized method
 */
export function Memoize(options?: MemoizeOptions<unknown[]> | undefined) {
  const opts = { __proto__: null, ...options } as MemoizeOptions<unknown[]>
  return (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown

    descriptor.value = memoize(originalMethod, {
      ...opts,
      name: opts.name || propertyKey,
    })

    return descriptor
  }
}
