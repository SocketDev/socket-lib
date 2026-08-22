/**
 * @file The iterator helpers in this package's three-export shape.
 *   The shims live beside this file as free functions taking the iterator as
 *   their first argument, because that is how a Node-18 caller has to reach
 *   them - there is no method on the prototype to call. This file pairs each
 *   with the native method where the engine has one.
 *   Not shimmed, and why:
 *
 *   - `chunks`, `windows`, `join`, `includes` are proposals no Node ships, so a
 *     shim would invent behavior rather than fill a gap.
 *   - `Iterator.prototype[Symbol.dispose]` is `version_added: false` in upstream
 *     compat data for Node, so there is nothing to match yet.
 */

import { ReflectApply, ReflectGet } from '../../primordials/reflect.mjs'
import {
  iteratorEveryShim,
  iteratorFindShim,
  iteratorForEachShim,
  iteratorReduceShim,
  iteratorSomeShim,
  iteratorToArrayShim,
} from './eager.mts'
import {
  iteratorDropShim,
  iteratorFilterShim,
  iteratorFlatMapShim,
  iteratorMapShim,
  iteratorTakeShim,
} from './lazy.mts'
import { iteratorPrototypeOf } from './shared.mts'
import { iteratorConcatShim, iteratorFromShim } from './statics.mts'

/**
 * The native `Iterator.prototype.<name>` as a free function taking the
 * iterator first, or undefined when the engine lacks it.
 *
 * One assertion bridges a reflective call to the shim's signature. The shapes
 * are checked against each other by the test262 run, which drives the native
 * and the shim through the same suite.
 */
export function nativeIteratorHelper<F>(name: string): F | undefined {
  const method = ReflectGet(iteratorPrototypeOf(), name)
  if (typeof method !== 'function') {
    return undefined
  }
  const bridge = (receiver: unknown, ...args: unknown[]) =>
    ReflectApply(method, receiver, args)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return bridge as F
}

/**
 * The native `Iterator.<name>` static, or undefined when absent.
 */
export function nativeIteratorStatic<F>(name: string): F | undefined {
  const iteratorCtor = ReflectGet(globalThis, 'Iterator')
  if (iteratorCtor === null || typeof iteratorCtor !== 'function') {
    return undefined
  }
  const method = ReflectGet(iteratorCtor, name)
  if (typeof method !== 'function') {
    return undefined
  }
  const bridge = (...args: unknown[]) =>
    ReflectApply(method, iteratorCtor, args)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return bridge as F
}

export const iteratorConcatNative =
  nativeIteratorStatic<typeof iteratorConcatShim>('concat')

export const iteratorConcat: typeof iteratorConcatShim =
  iteratorConcatNative ?? iteratorConcatShim

export const iteratorDropNative =
  nativeIteratorHelper<typeof iteratorDropShim>('drop')

export const iteratorDrop: typeof iteratorDropShim =
  iteratorDropNative ?? iteratorDropShim

export const iteratorEveryNative =
  nativeIteratorHelper<typeof iteratorEveryShim>('every')

export const iteratorEvery: typeof iteratorEveryShim =
  iteratorEveryNative ?? iteratorEveryShim

export const iteratorFilterNative =
  nativeIteratorHelper<typeof iteratorFilterShim>('filter')

export const iteratorFilter: typeof iteratorFilterShim =
  iteratorFilterNative ?? iteratorFilterShim

export const iteratorFindNative =
  nativeIteratorHelper<typeof iteratorFindShim>('find')

export const iteratorFind: typeof iteratorFindShim =
  iteratorFindNative ?? iteratorFindShim

export const iteratorFlatMapNative =
  nativeIteratorHelper<typeof iteratorFlatMapShim>('flatMap')

export const iteratorFlatMap: typeof iteratorFlatMapShim =
  iteratorFlatMapNative ?? iteratorFlatMapShim

export const iteratorForEachNative =
  nativeIteratorHelper<typeof iteratorForEachShim>('forEach')

export const iteratorForEach: typeof iteratorForEachShim =
  iteratorForEachNative ?? iteratorForEachShim

export const iteratorFromNative =
  nativeIteratorStatic<typeof iteratorFromShim>('from')

export const iteratorFrom: typeof iteratorFromShim =
  iteratorFromNative ?? iteratorFromShim

export const iteratorMapNative =
  nativeIteratorHelper<typeof iteratorMapShim>('map')

export const iteratorMap: typeof iteratorMapShim =
  iteratorMapNative ?? iteratorMapShim

export const iteratorReduceNative =
  nativeIteratorHelper<typeof iteratorReduceShim>('reduce')

export const iteratorReduce: typeof iteratorReduceShim =
  iteratorReduceNative ?? iteratorReduceShim

export const iteratorSomeNative =
  nativeIteratorHelper<typeof iteratorSomeShim>('some')

export const iteratorSome: typeof iteratorSomeShim =
  iteratorSomeNative ?? iteratorSomeShim

export const iteratorTakeNative =
  nativeIteratorHelper<typeof iteratorTakeShim>('take')

export const iteratorTake: typeof iteratorTakeShim =
  iteratorTakeNative ?? iteratorTakeShim

export const iteratorToArrayNative =
  nativeIteratorHelper<typeof iteratorToArrayShim>('toArray')

export const iteratorToArray: typeof iteratorToArrayShim =
  iteratorToArrayNative ?? iteratorToArrayShim
