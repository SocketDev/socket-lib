/**
 * @fileoverview Safe references to built-in functions and constructors.
 *
 * Captures references to JavaScript built-ins at module load time, before
 * user code can tamper with prototypes or globals. Consumers that process
 * adversarial input (PURL parsers, manifest readers, config validators,
 * anything that ingests untrusted strings or JSON) should import from here
 * instead of using globals directly, so prototype-pollution attacks on the
 * caller realm can't silently redirect library internals.
 *
 * Convention follows Node.js's internal primordials module:
 *
 * - **Static methods** retain their original name: `ObjectKeys`,
 *   `ArrayIsArray`, `JSONParse`.
 * - **Prototype methods** are uncurried via `uncurryThis`, so you call
 *   `StringPrototypeSlice(str, 0, 3)` instead of `str.slice(0, 3)`.
 * - **Constructors** get a `Ctor` suffix to avoid shadowing the capital-
 *   case global: `MapCtor`, `SetCtor`.
 *
 * **IMPORTANT**: do not use destructuring on `globalThis` or `Reflect`
 * here. tsgo has a bug that mis-transpiles destructured exports.
 * See: https://github.com/SocketDev/socket-packageurl-js/issues/3
 *
 * @see https://github.com/nicolo-ribaudo/tc39-proposal-primordials
 * @see https://github.com/nodejs/node/blob/main/lib/internal/per_context/primordials.js
 */

// ─── uncurryThis ───────────────────────────────────────────────────────
// Mirrors Node.js internal/per_context/primordials.js:
//   const { apply, bind, call } = Function.prototype
//   const uncurryThis = bind.bind(call)
const { apply, bind, call } = Function.prototype
export const uncurryThis = bind.bind(call) as <
  T,
  A extends readonly unknown[],
  R,
>(
  fn: (this: T, ...args: A) => R,
) => (self: T, ...args: A) => R
export const applyBind = bind.bind(apply) as <
  T,
  A extends readonly unknown[],
  R,
>(
  fn: (this: T, ...args: A) => R,
) => (self: T, args: A) => R

// ─── Constructors ──────────────────────────────────────────────────────
export const ArrayCtor: ArrayConstructor = Array
export const ArrayBufferCtor: ArrayBufferConstructor = ArrayBuffer
export const BooleanCtor: BooleanConstructor = Boolean
// BufferCtor is a Node-only global; `undefined` in the browser. Callers
// that import it in browser code get a type-safe `undefined` rather than
// a runtime ReferenceError.
export const BufferCtor: typeof globalThis.Buffer | undefined = (
  globalThis as { Buffer?: typeof globalThis.Buffer }
).Buffer
export const DataViewCtor: DataViewConstructor = DataView
export const DateCtor: DateConstructor = Date
export const ErrorCtor: ErrorConstructor = Error
// Error subclasses commonly thrown in validation paths.
export const AggregateErrorCtor: AggregateErrorConstructor = AggregateError
export const EvalErrorCtor: EvalErrorConstructor = EvalError
export const RangeErrorCtor: RangeErrorConstructor = RangeError
export const ReferenceErrorCtor: ReferenceErrorConstructor = ReferenceError
export const SyntaxErrorCtor: SyntaxErrorConstructor = SyntaxError
export const TypeErrorCtor: TypeErrorConstructor = TypeError
export const URIErrorCtor: URIErrorConstructor = URIError
export const MapCtor: MapConstructor = Map
export const NumberCtor: NumberConstructor = Number
export const ObjectCtor: ObjectConstructor = Object
export const PromiseCtor: PromiseConstructor = Promise
export const ProxyCtor: ProxyConstructor = Proxy
export const RegExpCtor: RegExpConstructor = RegExp
export const SetCtor: SetConstructor = Set
export const SharedArrayBufferCtor: SharedArrayBufferConstructor =
  SharedArrayBuffer
export const StringCtor: StringConstructor = String
export const SymbolCtor: SymbolConstructor = Symbol
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
export const URLCtor: typeof URL = URL
export const URLSearchParamsCtor: typeof URLSearchParams = URLSearchParams
export const WeakMapCtor: WeakMapConstructor = WeakMap
export const WeakRefCtor: WeakRefConstructor = WeakRef
export const WeakSetCtor: WeakSetConstructor = WeakSet

// ─── Global functions ──────────────────────────────────────────────────
export const decodeComponent = globalThis.decodeURIComponent
export const encodeComponent = globalThis.encodeURIComponent

// ─── JSON ──────────────────────────────────────────────────────────────
export const JSONParse = JSON.parse
export const JSONStringify = JSON.stringify

// ─── Array (static) ────────────────────────────────────────────────────
export const ArrayFrom = Array.from
export const ArrayIsArray = Array.isArray
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
export const ArrayPrototypeUnshift = uncurryThis(Array.prototype.unshift) as <
  T,
>(
  self: T[],
  ...items: T[]
) => number
export const ArrayPrototypeValues = uncurryThis(Array.prototype.values)

// ─── Buffer (static) ───────────────────────────────────────────────────
// Buffer is a Node-only global; these helpers are `undefined` in browsers.
// Typed as the corresponding member type | undefined so TS forces a
// null-check in cross-env code.
export const BufferAlloc: typeof Buffer.alloc | undefined = BufferCtor?.alloc
export const BufferAllocUnsafe: typeof Buffer.allocUnsafe | undefined =
  BufferCtor?.allocUnsafe
export const BufferAllocUnsafeSlow: typeof Buffer.allocUnsafeSlow | undefined =
  BufferCtor?.allocUnsafeSlow
export const BufferByteLength: typeof Buffer.byteLength | undefined =
  BufferCtor?.byteLength
export const BufferConcat: typeof Buffer.concat | undefined = BufferCtor?.concat
export const BufferFrom: typeof Buffer.from | undefined = BufferCtor?.from
export const BufferIsBuffer: typeof Buffer.isBuffer | undefined =
  BufferCtor?.isBuffer
export const BufferIsEncoding: typeof Buffer.isEncoding | undefined =
  BufferCtor?.isEncoding

// ─── Buffer (prototype) ────────────────────────────────────────────────
export const BufferPrototypeSlice:
  | ((buf: Buffer, start?: number, end?: number) => Buffer)
  | undefined = BufferCtor ? uncurryThis(BufferCtor.prototype.slice) : undefined
export const BufferPrototypeToString:
  | ((
      buf: Buffer,
      encoding?: BufferEncoding,
      start?: number,
      end?: number,
    ) => string)
  | undefined = BufferCtor
  ? uncurryThis(BufferCtor.prototype.toString)
  : undefined

// ─── Date (static) ─────────────────────────────────────────────────────
export const DateNow = Date.now
export const DateParse = Date.parse
export const DateUTC = Date.UTC

// ─── Date (prototype) ──────────────────────────────────────────────────
export const DatePrototypeGetTime = uncurryThis(Date.prototype.getTime)
export const DatePrototypeToISOString = uncurryThis(Date.prototype.toISOString)
export const DatePrototypeToLocaleString = uncurryThis(
  Date.prototype.toLocaleString,
)
export const DatePrototypeValueOf = uncurryThis(Date.prototype.valueOf)

// ─── Error (static) ────────────────────────────────────────────────────
// `Error.isError` is ES2025 (Node 22.18+). Older Node falls back to
// `instanceof Error` via the polyfill in src/errors.ts. The primordial
// reference is typed `Function | undefined` so callers in older
// environments don't crash at import time.
export const ErrorIsError: ((value: unknown) => value is Error) | undefined = (
  Error as { isError?: (v: unknown) => v is Error }
).isError

// ─── Function ──────────────────────────────────────────────────────────
export const FunctionPrototypeApply = uncurryThis(Function.prototype.apply) as (
  self: (...args: unknown[]) => unknown,
  thisArg: unknown,
  args: unknown[],
) => unknown
export const FunctionPrototypeBind = uncurryThis(Function.prototype.bind) as (
  self: (...args: unknown[]) => unknown,
  thisArg: unknown,
  ...args: unknown[]
) => (...args: unknown[]) => unknown
export const FunctionPrototypeCall = uncurryThis(Function.prototype.call) as (
  self: (...args: unknown[]) => unknown,
  thisArg: unknown,
  ...args: unknown[]
) => unknown

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
export const IteratorPrototypeReturn =
  typeof _iteratorProto.return === 'function'
    ? uncurryThis(_iteratorProto.return)
    : undefined

// ─── Map (prototype) ───────────────────────────────────────────────────
export const MapPrototypeClear = uncurryThis(Map.prototype.clear)
export const MapPrototypeDelete = uncurryThis(Map.prototype.delete)
export const MapPrototypeEntries = uncurryThis(Map.prototype.entries)
export const MapPrototypeForEach = uncurryThis(Map.prototype.forEach)
export const MapPrototypeGet = uncurryThis(Map.prototype.get)
export const MapPrototypeHas = uncurryThis(Map.prototype.has)
export const MapPrototypeKeys = uncurryThis(Map.prototype.keys)
export const MapPrototypeSet = uncurryThis(Map.prototype.set)
export const MapPrototypeValues = uncurryThis(Map.prototype.values)

// ─── Math ──────────────────────────────────────────────────────────────
export const MathAbs = Math.abs
export const MathCeil = Math.ceil
export const MathFloor = Math.floor
export const MathMax = Math.max
export const MathMin = Math.min
export const MathPow = Math.pow
export const MathRandom = Math.random
export const MathRound = Math.round
export const MathSign = Math.sign
export const MathSqrt = Math.sqrt
export const MathTrunc = Math.trunc

// ─── Number ───────────────────────────────────────────────────────────
export const NumberIsFinite = Number.isFinite
export const NumberIsInteger = Number.isInteger
export const NumberIsNaN = Number.isNaN
export const NumberIsSafeInteger = Number.isSafeInteger
export const NumberParseFloat = Number.parseFloat
export const NumberParseInt = Number.parseInt
export const NumberPrototypeToFixed = uncurryThis(Number.prototype.toFixed)
export const NumberPrototypeToString = uncurryThis(Number.prototype.toString)

// ─── Object (static) ───────────────────────────────────────────────────
export const ObjectAssign = Object.assign
export const ObjectCreate = Object.create
export const ObjectDefineProperties = Object.defineProperties
export const ObjectDefineProperty = Object.defineProperty
export const ObjectEntries = Object.entries
export const ObjectFreeze = Object.freeze
export const ObjectFromEntries = Object.fromEntries
export const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
export const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
export const ObjectGetOwnPropertyNames = Object.getOwnPropertyNames
export const ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols
export const ObjectGetPrototypeOf = Object.getPrototypeOf
export const ObjectHasOwn = Object.hasOwn
export const ObjectIs = Object.is
export const ObjectIsExtensible = Object.isExtensible
export const ObjectIsFrozen = Object.isFrozen
export const ObjectIsSealed = Object.isSealed
export const ObjectKeys = Object.keys
export const ObjectPreventExtensions = Object.preventExtensions
export const ObjectSeal = Object.seal
export const ObjectSetPrototypeOf = Object.setPrototypeOf
export const ObjectValues = Object.values

// ─── Object (prototype) ────────────────────────────────────────────────
export const ObjectPrototype = Object.prototype
export const ObjectPrototypeHasOwnProperty = uncurryThis(
  Object.prototype.hasOwnProperty,
)
export const ObjectPrototypeIsPrototypeOf = uncurryThis(
  Object.prototype.isPrototypeOf,
)
export const ObjectPrototypePropertyIsEnumerable = uncurryThis(
  Object.prototype.propertyIsEnumerable,
)
export const ObjectPrototypeToString = uncurryThis(Object.prototype.toString)
export const ObjectPrototypeValueOf = uncurryThis(Object.prototype.valueOf)

// ─── Promise (static) ──────────────────────────────────────────────────
export const PromiseAll = Promise.all.bind(Promise)
export const PromiseAllSettled = Promise.allSettled.bind(Promise)
export const PromiseAny = Promise.any.bind(Promise)
export const PromiseRace = Promise.race.bind(Promise)
export const PromiseReject = Promise.reject.bind(Promise)
export const PromiseResolve = Promise.resolve.bind(Promise)
// `Promise.withResolvers` is ES2024 (Node 22.0+). Typed as
// `Function | undefined` for safety even though Node 22+ always has it.
export const PromiseWithResolvers: typeof Promise.withResolvers | undefined = (
  Promise as { withResolvers?: typeof Promise.withResolvers }
).withResolvers?.bind(Promise) as typeof Promise.withResolvers | undefined

// ─── Promise (prototype) ───────────────────────────────────────────────
export const PromisePrototypeCatch = uncurryThis(Promise.prototype.catch)
export const PromisePrototypeFinally = uncurryThis(Promise.prototype.finally)
export const PromisePrototypeThen = uncurryThis(Promise.prototype.then)

// ─── Reflect ───────────────────────────────────────────────────────────
export const ReflectApply = Reflect.apply
export const ReflectConstruct = Reflect.construct
export const ReflectDefineProperty = Reflect.defineProperty
export const ReflectDeleteProperty = Reflect.deleteProperty
export const ReflectGet = Reflect.get
export const ReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor
export const ReflectGetPrototypeOf = Reflect.getPrototypeOf
export const ReflectHas = Reflect.has
export const ReflectIsExtensible = Reflect.isExtensible
export const ReflectOwnKeys = Reflect.ownKeys
export const ReflectPreventExtensions = Reflect.preventExtensions
export const ReflectSet = Reflect.set
export const ReflectSetPrototypeOf = Reflect.setPrototypeOf

// ─── RegExp (static) ───────────────────────────────────────────────────
// `RegExp.escape` is ES2025 (Node 22.18+). Typed `Function | undefined`
// for safety even though Node 22.18+ always has it. Callers needing a
// portable shape should null-check.
export const RegExpEscape: ((s: string) => string) | undefined = (
  RegExp as { escape?: (s: string) => string }
).escape

// ─── RegExp (prototype) ────────────────────────────────────────────────
export const RegExpPrototypeExec = uncurryThis(RegExp.prototype.exec)
export const RegExpPrototypeTest = uncurryThis(RegExp.prototype.test)
export const RegExpPrototypeSymbolMatch = uncurryThis(
  RegExp.prototype[Symbol.match] as (this: RegExp, str: string) => unknown,
)
export const RegExpPrototypeSymbolReplace = uncurryThis(
  RegExp.prototype[Symbol.replace] as (
    this: RegExp,
    str: string,
    replaceValue: string,
  ) => string,
)

// ─── Set (prototype) ───────────────────────────────────────────────────
export const SetPrototypeAdd = uncurryThis(Set.prototype.add)
export const SetPrototypeClear = uncurryThis(Set.prototype.clear)
export const SetPrototypeDelete = uncurryThis(Set.prototype.delete)
export const SetPrototypeEntries = uncurryThis(Set.prototype.entries)
export const SetPrototypeForEach = uncurryThis(Set.prototype.forEach)
export const SetPrototypeHas = uncurryThis(Set.prototype.has)
export const SetPrototypeKeys = uncurryThis(Set.prototype.keys)
export const SetPrototypeValues = uncurryThis(Set.prototype.values)

// ─── String (static) ───────────────────────────────────────────────────
export const StringFromCharCode = String.fromCharCode
export const StringFromCodePoint = String.fromCodePoint
export const StringRaw = String.raw

// ─── String (prototype) ────────────────────────────────────────────────
export const StringPrototypeAt = uncurryThis(String.prototype.at)
export const StringPrototypeCharAt = uncurryThis(String.prototype.charAt)
export const StringPrototypeCharCodeAt = uncurryThis(
  String.prototype.charCodeAt,
)
export const StringPrototypeCodePointAt = uncurryThis(
  String.prototype.codePointAt,
)
export const StringPrototypeConcat = uncurryThis(String.prototype.concat) as (
  self: string,
  ...strs: string[]
) => string
export const StringPrototypeEndsWith = uncurryThis(String.prototype.endsWith)
export const StringPrototypeIncludes = uncurryThis(String.prototype.includes)
export const StringPrototypeIndexOf = uncurryThis(String.prototype.indexOf)
export const StringPrototypeLastIndexOf = uncurryThis(
  String.prototype.lastIndexOf,
)
export const StringPrototypeLocaleCompare = uncurryThis(
  String.prototype.localeCompare,
)
export const StringPrototypeMatch = uncurryThis(
  String.prototype.match as (
    this: string,
    matcher: string | RegExp,
  ) => RegExpMatchArray | null,
)
export const StringPrototypeMatchAll = uncurryThis(
  String.prototype.matchAll as (
    this: string,
    matcher: RegExp | string,
  ) => IterableIterator<RegExpMatchArray>,
)
export const StringPrototypeNormalize = uncurryThis(String.prototype.normalize)
export const StringPrototypePadEnd = uncurryThis(String.prototype.padEnd)
export const StringPrototypePadStart = uncurryThis(String.prototype.padStart)
export const StringPrototypeRepeat = uncurryThis(String.prototype.repeat)
export const StringPrototypeReplace = uncurryThis(
  String.prototype.replace as (
    this: string,
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: any[]) => string),
  ) => string,
)
export const StringPrototypeReplaceAll = uncurryThis(
  String.prototype.replaceAll as (
    this: string,
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: any[]) => string),
  ) => string,
)
export const StringPrototypeSearch = uncurryThis(String.prototype.search)
export const StringPrototypeSlice = uncurryThis(String.prototype.slice)
export const StringPrototypeSplit = uncurryThis(String.prototype.split) as (
  self: string,
  separator: string | RegExp,
  limit?: number,
) => string[]
export const StringPrototypeStartsWith = uncurryThis(
  String.prototype.startsWith,
)
export const StringPrototypeSubstring = uncurryThis(String.prototype.substring)
export const StringPrototypeToLocaleLowerCase = uncurryThis(
  String.prototype.toLocaleLowerCase,
)
export const StringPrototypeToLocaleUpperCase = uncurryThis(
  String.prototype.toLocaleUpperCase,
)
export const StringPrototypeToLowerCase = uncurryThis(
  String.prototype.toLowerCase,
)
export const StringPrototypeToUpperCase = uncurryThis(
  String.prototype.toUpperCase,
)
export const StringPrototypeTrim = uncurryThis(String.prototype.trim)
export const StringPrototypeTrimEnd = uncurryThis(String.prototype.trimEnd)
export const StringPrototypeTrimStart = uncurryThis(String.prototype.trimStart)

// ─── Symbol ────────────────────────────────────────────────────────────
export const SymbolAsyncIterator = Symbol.asyncIterator
export const SymbolFor = Symbol.for
export const SymbolIterator = Symbol.iterator
export const SymbolToPrimitive = Symbol.toPrimitive
export const SymbolToStringTag = Symbol.toStringTag

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

// ─── WeakMap (prototype) ───────────────────────────────────────────────
export const WeakMapPrototypeDelete = uncurryThis(WeakMap.prototype.delete)
export const WeakMapPrototypeGet = uncurryThis(WeakMap.prototype.get)
export const WeakMapPrototypeHas = uncurryThis(WeakMap.prototype.has)
export const WeakMapPrototypeSet = uncurryThis(WeakMap.prototype.set)

// ─── WeakSet (prototype) ───────────────────────────────────────────────
export const WeakSetPrototypeAdd = uncurryThis(WeakSet.prototype.add)
export const WeakSetPrototypeDelete = uncurryThis(WeakSet.prototype.delete)
export const WeakSetPrototypeHas = uncurryThis(WeakSet.prototype.has)
