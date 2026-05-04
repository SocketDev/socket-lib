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

// ─── Smol bindings (feature-detect) ────────────────────────────────────
// When running on socket-btm's smol Node binary, two extra builtins
// are available:
//
//   - `node:smol-util` — native uncurryThis / applyBind. ~2x faster
//     than the JS form's two-dispatch path.
//   - `node:smol-primordial` — V8 Fast API typed Math.* / Number.is*.
//     TurboFan inlines them into JIT-compiled callers. ~30-50% gain
//     on hot loops.
//
// On stock Node, browsers, Deno, and Bun, both probes return undefined
// and exports below fall back to the standard built-ins. Same identifier
// name across runtimes — consumer code never changes.
import { getSmolPrimordial } from './smol/primordial'
import { getSmolUtil } from './smol/util'

const _smolUtil = getSmolUtil()
const _smolPrimordial = getSmolPrimordial()

// ─── uncurryThis ───────────────────────────────────────────────────────
// Mirrors Node.js internal/per_context/primordials.js:
//   const { apply, bind, call } = Function.prototype
//   const uncurryThis = bind.bind(call)
const { apply, bind, call } = Function.prototype
export const uncurryThis =
  _smolUtil?.uncurryThis ??
  (bind.bind(call) as <T, A extends readonly unknown[], R>(
    fn: (this: T, ...args: A) => R,
  ) => (self: T, ...args: A) => R)
export const applyBind =
  _smolUtil?.applyBind ??
  (bind.bind(apply) as <T, A extends readonly unknown[], R>(
    fn: (this: T, ...args: A) => R,
  ) => (self: T, args: A) => R)

// ─── Constructors ──────────────────────────────────────────────────────
export const ArrayCtor: ArrayConstructor = Array
export const ArrayBufferCtor: ArrayBufferConstructor = ArrayBuffer
export const BigIntCtor: BigIntConstructor = BigInt
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

// ─── Global values ─────────────────────────────────────────────────────
// `Infinity` and `NaN` are the language's two non-finite number primitives.
// They are non-writable / non-configurable on globalThis since ES5, so the
// captured value is guaranteed to match the live global. Re-exported here
// for symmetry with `NumberPOSITIVE_INFINITY` / `NumberNaN`.
export const InfinityValue: number = Infinity
export const NaNValue: number = NaN
// `globalThisRef` is the captured `globalThis` reference — same object
// in every realm and frozen on the spec side. Importers that need to
// install or read globals safely use this rather than the keyword
// directly.
export const globalThisRef: typeof globalThis = globalThis

// ─── Global functions ──────────────────────────────────────────────────
export const decodeComponent = globalThis.decodeURIComponent
export const encodeComponent = globalThis.encodeURIComponent

// ─── JSON ──────────────────────────────────────────────────────────────
export const JSONParse = JSON.parse
export const JSONStringify = JSON.stringify

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

// V8-specific stack trace API. See https://v8.dev/docs/stack-trace-api.
// These are present on V8 (Node, Chromium, Deno) but not in
// JavaScriptCore / SpiderMonkey, so each is typed `| undefined` to keep
// non-V8 importers safe.

// `Error.captureStackTrace(targetObject, constructorOpt?)` — attaches a
// `.stack` property to `targetObject`. Captured at load time so callers
// can't intercept by overwriting the global later.
export const ErrorCaptureStackTrace:
  | ((targetObject: object, constructorOpt?: Function) => void)
  | undefined = (
  Error as {
    captureStackTrace?: (
      targetObject: object,
      constructorOpt?: Function,
    ) => void
  }
).captureStackTrace

// `Error.prepareStackTrace` — invoked by V8 when `error.stack` is first
// read. Captured at load time so we have the engine default even if
// user code later overwrites it (some libraries clobber this for
// source-map remapping). Setter not exposed — assigning to the
// primordial wouldn't affect V8's lookup, which always reads
// `Error.prepareStackTrace` fresh.
export const ErrorPrepareStackTrace:
  | ((error: Error, structuredStackTrace: NodeJS.CallSite[]) => unknown)
  | undefined = (
  Error as {
    prepareStackTrace?: (
      error: Error,
      structuredStackTrace: NodeJS.CallSite[],
    ) => unknown
  }
).prepareStackTrace

// `Error.stackTraceLimit` — max frames V8 captures per stack. May be a
// data property (today on Node) or an accessor (some bundler shims).
// Returning a function avoids capturing a stale snapshot — callers that
// need the live value invoke `ErrorStackTraceLimit()` and get whatever
// V8 currently reports.
//
// `__lookupGetter__` is "annex B legacy" but supported in V8 / SpiderMonkey
// / JavaScriptCore. We probe it once at load time and fall back to
// reading the data property if no accessor exists.
const _stackTraceLimitGetter: (() => number) | undefined = (() => {
  const getter = (
    Error as unknown as {
      __lookupGetter__?: (key: string) => (() => number) | undefined
    }
  ).__lookupGetter__?.('stackTraceLimit')
  if (typeof getter === 'function') {
    return () => getter.call(Error)
  }
  return undefined
})()
export function ErrorStackTraceLimit(): number | undefined {
  if (_stackTraceLimitGetter) {
    return _stackTraceLimitGetter()
  }
  return (Error as { stackTraceLimit?: number }).stackTraceLimit
}

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
export const FunctionPrototypeToString = uncurryThis(
  Function.prototype.toString,
) as (self: (...args: unknown[]) => unknown) => string

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

// ─── Math (constants) ──────────────────────────────────────────────────
export const MathE = Math.E
export const MathLN2 = Math.LN2
export const MathLN10 = Math.LN10
export const MathLOG2E = Math.LOG2E
export const MathLOG10E = Math.LOG10E
export const MathPI = Math.PI
export const MathSQRT1_2 = Math.SQRT1_2
export const MathSQRT2 = Math.SQRT2

// ─── Math (methods) ────────────────────────────────────────────────────
// Each entry prefers `_smolPrimordial.mathX` when running on the smol
// Node binary (V8 Fast API typed implementation, TurboFan-inlinable),
// falling back to `Math.x` on stock Node + non-Node runtimes. Math
// constants don't get fast-pathed (no benefit — they're already
// pre-computed scalar values).
export const MathAbs = _smolPrimordial?.mathAbs ?? Math.abs
export const MathAcos = _smolPrimordial?.mathAcos ?? Math.acos
export const MathAcosh = _smolPrimordial?.mathAcosh ?? Math.acosh
export const MathAsin = _smolPrimordial?.mathAsin ?? Math.asin
export const MathAsinh = _smolPrimordial?.mathAsinh ?? Math.asinh
export const MathAtan = _smolPrimordial?.mathAtan ?? Math.atan
export const MathAtan2 = _smolPrimordial?.mathAtan2 ?? Math.atan2
export const MathAtanh = _smolPrimordial?.mathAtanh ?? Math.atanh
export const MathCbrt = _smolPrimordial?.mathCbrt ?? Math.cbrt
export const MathCeil = _smolPrimordial?.mathCeil ?? Math.ceil
export const MathClz32 = _smolPrimordial?.mathClz32 ?? Math.clz32
export const MathCos = _smolPrimordial?.mathCos ?? Math.cos
export const MathCosh = _smolPrimordial?.mathCosh ?? Math.cosh
export const MathExp = _smolPrimordial?.mathExp ?? Math.exp
export const MathExpm1 = _smolPrimordial?.mathExpm1 ?? Math.expm1
// `Math.f16round` is ES2025 (Node 22+ / V8 12.x). Older engines lack
// it; the runtime check keeps us undefined-safe instead of crashing
// at import time. No smol fast-path yet (would need a separate ES2025
// type signature in the binding).
export const MathF16round: ((value: number) => number) | undefined = (
  Math as { f16round?: (value: number) => number }
).f16round
export const MathFloor = _smolPrimordial?.mathFloor ?? Math.floor
export const MathFround = _smolPrimordial?.mathFround ?? Math.fround
export const MathHypot = _smolPrimordial?.mathHypot ?? Math.hypot
export const MathImul = _smolPrimordial?.mathImul ?? Math.imul
export const MathLog = _smolPrimordial?.mathLog ?? Math.log
export const MathLog1p = _smolPrimordial?.mathLog1p ?? Math.log1p
export const MathLog2 = _smolPrimordial?.mathLog2 ?? Math.log2
export const MathLog10 = _smolPrimordial?.mathLog10 ?? Math.log10
// Math.max / Math.min are variadic. The smol fast path only specializes
// the 2-arg case at the C++ level; variadic callers fall back to
// Math.max/min anyway via V8's slow-path machinery. Stick with the
// stock builtins here — they're already V8-inlined for the common 2-arg
// case via type feedback.
export const MathMax = Math.max
export const MathMin = Math.min
export const MathPow = _smolPrimordial?.mathPow ?? Math.pow
// Math.random doesn't fit a fast-path shape (no args, side-effecting
// PRNG state). Stock builtin is already V8-inlined.
export const MathRandom = Math.random
export const MathRound = _smolPrimordial?.mathRound ?? Math.round
export const MathSign = _smolPrimordial?.mathSign ?? Math.sign
export const MathSin = _smolPrimordial?.mathSin ?? Math.sin
export const MathSinh = _smolPrimordial?.mathSinh ?? Math.sinh
export const MathSqrt = _smolPrimordial?.mathSqrt ?? Math.sqrt
export const MathTan = _smolPrimordial?.mathTan ?? Math.tan
export const MathTanh = _smolPrimordial?.mathTanh ?? Math.tanh
export const MathTrunc = _smolPrimordial?.mathTrunc ?? Math.trunc

// ─── Number (constants) ────────────────────────────────────────────────
export const NumberEPSILON = Number.EPSILON
export const NumberMAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
export const NumberMAX_VALUE = Number.MAX_VALUE
export const NumberMIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER
export const NumberMIN_VALUE = Number.MIN_VALUE
export const NumberNEGATIVE_INFINITY = Number.NEGATIVE_INFINITY
export const NumberPOSITIVE_INFINITY = Number.POSITIVE_INFINITY

// ─── Number (methods) ──────────────────────────────────────────────────
// Predicates prefer the smol fast-path; static parse* keep the stock
// builtins (their fast paths require Local<String> handling, deferred
// to a future binding extension).
export const NumberIsFinite = _smolPrimordial?.numberIsFinite ?? Number.isFinite
export const NumberIsInteger =
  _smolPrimordial?.numberIsInteger ?? Number.isInteger
export const NumberIsNaN = _smolPrimordial?.numberIsNaN ?? Number.isNaN
export const NumberIsSafeInteger =
  _smolPrimordial?.numberIsSafeInteger ?? Number.isSafeInteger
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

// Annex B legacy accessor methods. Spec'd as "normative optional" but
// implemented in every major engine (V8, SpiderMonkey, JavaScriptCore).
// Equivalent to Object.defineProperty / Object.getOwnPropertyDescriptor
// but operate on a target's prototype chain rather than its own props,
// which is occasionally what you actually want (e.g. probing whether
// a class defines a getter without instantiating).
//
// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/__lookupGetter__
const _objectProto = Object.prototype as unknown as {
  __defineGetter__: (this: object, key: PropertyKey, fn: () => unknown) => void
  __defineSetter__: (
    this: object,
    key: PropertyKey,
    fn: (value: unknown) => void,
  ) => void
  __lookupGetter__: (
    this: object,
    key: PropertyKey,
  ) => (() => unknown) | undefined
  __lookupSetter__: (
    this: object,
    key: PropertyKey,
  ) => ((value: unknown) => void) | undefined
}
export const ObjectPrototypeDefineGetter = uncurryThis(
  _objectProto.__defineGetter__,
)
export const ObjectPrototypeDefineSetter = uncurryThis(
  _objectProto.__defineSetter__,
)
export const ObjectPrototypeLookupGetter = uncurryThis(
  _objectProto.__lookupGetter__,
)
export const ObjectPrototypeLookupSetter = uncurryThis(
  _objectProto.__lookupSetter__,
)

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
// `Symbol.asyncDispose` and `Symbol.dispose` are ES2024 (Node 20.4+).
// Older engines lack them; use `| undefined` so importers don't crash
// at load time.
export const SymbolAsyncDispose: typeof Symbol.asyncDispose | undefined = (
  Symbol as { asyncDispose?: typeof Symbol.asyncDispose }
).asyncDispose
export const SymbolAsyncIterator = Symbol.asyncIterator
export const SymbolDispose: typeof Symbol.dispose | undefined = (
  Symbol as { dispose?: typeof Symbol.dispose }
).dispose
export const SymbolFor = Symbol.for
export const SymbolHasInstance = Symbol.hasInstance
export const SymbolIsConcatSpreadable = Symbol.isConcatSpreadable
export const SymbolIterator = Symbol.iterator
export const SymbolKeyFor = Symbol.keyFor
export const SymbolMatch = Symbol.match
export const SymbolMatchAll = Symbol.matchAll
export const SymbolReplace = Symbol.replace
export const SymbolSearch = Symbol.search
export const SymbolSpecies = Symbol.species
export const SymbolSplit = Symbol.split
export const SymbolToPrimitive = Symbol.toPrimitive
export const SymbolToStringTag = Symbol.toStringTag
export const SymbolUnscopables = Symbol.unscopables
// `description` is an accessor on `Symbol.prototype`, not a method.
// `__lookupGetter__` resolves it cleanly across engines without
// touching the live property descriptor.
const _symbolDescriptionGetter = (
  Symbol.prototype as unknown as {
    __lookupGetter__: (key: string) => (() => string | undefined) | undefined
  }
).__lookupGetter__('description')
export function SymbolPrototypeDescription(self: symbol): string | undefined {
  return _symbolDescriptionGetter
    ? _symbolDescriptionGetter.call(self)
    : self.description
}
export const SymbolPrototypeToString = uncurryThis(Symbol.prototype.toString)
export const SymbolPrototypeValueOf = uncurryThis(Symbol.prototype.valueOf) as (
  self: symbol,
) => symbol

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
