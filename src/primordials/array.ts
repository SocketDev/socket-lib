/**
 * @file Safe references to `Array`, typed-array, `ArrayBuffer`, `DataView`,
 *   `Atomics`, and shared iterator-prototype primordials. `Array.fromAsync` and
 *   `Array.prototype.with` are ES2024 / ES2023; the primordial captures the
 *   live reference at module load so consumers never see a tampered global.
 */

import { getSmolPrimordial } from '../smol/primordial'

import { uncurryThis } from './uncurry'

const _smolPrimordial = getSmolPrimordial()

// ─── Constructors ──────────────────────────────────────────────────────
export const ArrayCtor: ArrayConstructor = Array
export const ArrayBufferCtor: ArrayBufferConstructor = ArrayBuffer
export const DataViewCtor: DataViewConstructor = DataView
// Typed-array constructors. Same shape as Array — bundled externals
// (npm-pack, adm-zip, tar-fs, etc.) reach for these directly.
export const Float32ArrayCtor: Float32ArrayConstructor = Float32Array
export const Float64ArrayCtor: Float64ArrayConstructor = Float64Array
export const Int8ArrayCtor: Int8ArrayConstructor = Int8Array
export const Int16ArrayCtor: Int16ArrayConstructor = Int16Array
export const Int32ArrayCtor: Int32ArrayConstructor = Int32Array
export const Uint8ArrayCtor: Uint8ArrayConstructor = Uint8Array
export const Uint8ClampedArrayCtor: Uint8ClampedArrayConstructor =
  Uint8ClampedArray
export const Uint16ArrayCtor: Uint16ArrayConstructor = Uint16Array
export const Uint32ArrayCtor: Uint32ArrayConstructor = Uint32Array

// ─── Array (static) ────────────────────────────────────────────────────
export const ArrayFrom = Array.from
// `Array.fromAsync` is ES2024 (Node 22.0+ / V8 ≥ 12.0). Typed as
// `Function | undefined` for safety even though Node 22+ always has it.
// Unbound: matches `ArrayFrom`. The spec algorithm uses `this` as the
// species constructor, so an undefined `this` falls back to a plain
// Array — exactly what we want.
//
// TS lib may not include `Array.fromAsync` yet (it's in ES2024
// `lib.es2024.array.d.ts`); typed via the local signature.
export type ArrayFromAsync = <T>(
  source:
    | AsyncIterable<T>
    | Iterable<T | PromiseLike<T>>
    | ArrayLike<T | PromiseLike<T>>,
) => Promise<T[]>
export const ArrayFromAsync: ArrayFromAsync | undefined = (
  Array as unknown as { fromAsync?: ArrayFromAsync }
).fromAsync
// `arrayIsArray` is a Fast API binding — a single map-pointer
// comparison that V8 inlines into JIT'd callers. Spec semantics
// match Array.isArray (excludes typed arrays + array-like objects).
export const ArrayIsArray = _smolPrimordial?.arrayIsArray ?? Array.isArray
export const ArrayOf = Array.of

// ─── ArrayBuffer (static) ──────────────────────────────────────────────
export const ArrayBufferIsView = ArrayBuffer.isView

// ─── Atomics (static) ──────────────────────────────────────────────────
// Atomics.wait blocks the calling thread until either notified or the
// timeout elapses. Used by the sync retry loop in fs.safeDeleteSync to
// sleep without spinning the CPU.
export const AtomicsWait = Atomics.wait

// ─── Array (prototype) ─────────────────────────────────────────────────
export const ArrayPrototypeAt = uncurryThis(Array.prototype.at)
export const ArrayPrototypeConcat = uncurryThis(Array.prototype.concat) as <T>(
  self: T[],
  ...items: Array<T | readonly T[]>
) => T[]
export const ArrayPrototypeCopyWithin = uncurryThis(Array.prototype.copyWithin)
export const ArrayPrototypeEntries = uncurryThis(Array.prototype.entries)
export const ArrayPrototypeEvery = uncurryThis(Array.prototype.every)
export const ArrayPrototypeFill = uncurryThis(Array.prototype.fill)
export const ArrayPrototypeFilter = uncurryThis(Array.prototype.filter)
export const ArrayPrototypeFind = uncurryThis(Array.prototype.find)
export const ArrayPrototypeFindIndex = uncurryThis(Array.prototype.findIndex)
export const ArrayPrototypeFindLast = uncurryThis(Array.prototype.findLast)
export const ArrayPrototypeFindLastIndex = uncurryThis(
  Array.prototype.findLastIndex,
)
export const ArrayPrototypeFlat = uncurryThis(Array.prototype.flat)
export const ArrayPrototypeFlatMap = uncurryThis(Array.prototype.flatMap)
export const ArrayPrototypeForEach = uncurryThis(Array.prototype.forEach)
export const ArrayPrototypeIncludes = uncurryThis(Array.prototype.includes)
export const ArrayPrototypeIndexOf = uncurryThis(Array.prototype.indexOf)
export const ArrayPrototypeJoin = uncurryThis(Array.prototype.join)
export const ArrayPrototypeKeys = uncurryThis(Array.prototype.keys)
export const ArrayPrototypeLastIndexOf = uncurryThis(
  Array.prototype.lastIndexOf,
)
export const ArrayPrototypeMap = uncurryThis(Array.prototype.map)
export const ArrayPrototypePop = uncurryThis(Array.prototype.pop)
export const ArrayPrototypePush = uncurryThis(Array.prototype.push) as <T>(
  self: T[],
  ...items: T[]
) => number
export const ArrayPrototypeReduce = uncurryThis(Array.prototype.reduce)
export const ArrayPrototypeReduceRight = uncurryThis(
  Array.prototype.reduceRight,
)
export const ArrayPrototypeReverse = uncurryThis(Array.prototype.reverse)
export const ArrayPrototypeShift = uncurryThis(Array.prototype.shift)
export const ArrayPrototypeSlice = uncurryThis(Array.prototype.slice)
export const ArrayPrototypeSome = uncurryThis(Array.prototype.some)
export const ArrayPrototypeSort = uncurryThis(Array.prototype.sort)
export const ArrayPrototypeSplice = uncurryThis(Array.prototype.splice) as <T>(
  self: T[],
  start: number,
  deleteCount?: number,
  ...items: T[]
) => T[]
export const ArrayPrototypeToReversed = uncurryThis(Array.prototype.toReversed)
export const ArrayPrototypeToSorted = uncurryThis(Array.prototype.toSorted)
// `toSpliced` is a copying variant of `splice`; same `(start, deleteCount, ...items)` signature.
export const ArrayPrototypeToSpliced = uncurryThis(
  Array.prototype.toSpliced,
) as <T>(self: T[], start: number, deleteCount?: number, ...items: T[]) => T[]
export const ArrayPrototypeUnshift = uncurryThis(Array.prototype.unshift) as <
  T,
>(
  self: T[],
  ...items: T[]
) => number
export const ArrayPrototypeValues = uncurryThis(Array.prototype.values)
// ES2023 Change Array By Copy — `arr.with(i, v)` returns a copy with
// index `i` replaced by `v`.
export const ArrayPrototypeWith = uncurryThis(Array.prototype.with) as <T>(
  self: T[],
  index: number,
  value: T,
) => T[]

// ─── Iterator (prototype) ──────────────────────────────────────────────
// Map#keys() / Set#values() / etc. share an iterator prototype chain.
// In some engines `.next` lives on the immediate prototype; in others it
// lives on a shared ancestor. Walk up until we find the level that owns
// the method so `uncurryThis` grabs the same one regardless of engine.
const _anyIterator = new Map().keys() as Iterator<unknown>
let _iteratorLookup: object | null = Object.getPrototypeOf(_anyIterator)
while (
  _iteratorLookup &&
  typeof (_iteratorLookup as { next?: unknown }).next !== 'function'
) {
  _iteratorLookup = Object.getPrototypeOf(_iteratorLookup)
}
const _iteratorProto = _iteratorLookup as {
  next: (this: Iterator<unknown>) => IteratorResult<unknown>
  return?: (this: Iterator<unknown>, value?: unknown) => IteratorResult<unknown>
}
export const IteratorPrototypeNext = uncurryThis(_iteratorProto.next)
// Iterator.prototype.return is always a function in modern V8.
/* c8 ignore start */
export const IteratorPrototypeReturn =
  typeof _iteratorProto.return === 'function'
    ? uncurryThis(_iteratorProto.return)
    : undefined
/* c8 ignore stop */
