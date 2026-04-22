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
const uncurryThis = bind.bind(call) as <T, A extends readonly unknown[], R>(
  fn: (this: T, ...args: A) => R,
) => (self: T, ...args: A) => R
const applyBind = bind.bind(apply) as <T, A extends readonly unknown[], R>(
  fn: (this: T, ...args: A) => R,
) => (self: T, args: A) => R

// ─── Constructors ──────────────────────────────────────────────────────
const ArrayCtor: ArrayConstructor = Array
const BooleanCtor: BooleanConstructor = Boolean
const DateCtor: DateConstructor = Date
const ErrorCtor: ErrorConstructor = Error
const MapCtor: MapConstructor = Map
const NumberCtor: NumberConstructor = Number
const ObjectCtor: ObjectConstructor = Object
const PromiseCtor: PromiseConstructor = Promise
const RegExpCtor: RegExpConstructor = RegExp
const SetCtor: SetConstructor = Set
const StringCtor: StringConstructor = String
const SymbolCtor: SymbolConstructor = Symbol
const URLCtor: typeof URL = URL
const URLSearchParamsCtor: typeof URLSearchParams = URLSearchParams
const WeakMapCtor: WeakMapConstructor = WeakMap
const WeakRefCtor: WeakRefConstructor = WeakRef
const WeakSetCtor: WeakSetConstructor = WeakSet

// ─── Global functions ──────────────────────────────────────────────────
const decodeComponent = globalThis.decodeURIComponent
const encodeComponent = globalThis.encodeURIComponent

// ─── JSON ──────────────────────────────────────────────────────────────
const JSONParse = JSON.parse
const JSONStringify = JSON.stringify

// ─── Array (static) ────────────────────────────────────────────────────
const ArrayFrom = Array.from
const ArrayIsArray = Array.isArray
const ArrayOf = Array.of

// ─── Array (prototype) ─────────────────────────────────────────────────
const ArrayPrototypeAt = uncurryThis(Array.prototype.at)
const ArrayPrototypeConcat = uncurryThis(Array.prototype.concat) as <T>(
  self: T[],
  ...items: Array<T | readonly T[]>
) => T[]
const ArrayPrototypeCopyWithin = uncurryThis(Array.prototype.copyWithin)
const ArrayPrototypeEntries = uncurryThis(Array.prototype.entries)
const ArrayPrototypeEvery = uncurryThis(Array.prototype.every)
const ArrayPrototypeFill = uncurryThis(Array.prototype.fill)
const ArrayPrototypeFilter = uncurryThis(Array.prototype.filter)
const ArrayPrototypeFind = uncurryThis(Array.prototype.find)
const ArrayPrototypeFindIndex = uncurryThis(Array.prototype.findIndex)
const ArrayPrototypeFindLast = uncurryThis(Array.prototype.findLast)
const ArrayPrototypeFindLastIndex = uncurryThis(Array.prototype.findLastIndex)
const ArrayPrototypeFlat = uncurryThis(Array.prototype.flat)
const ArrayPrototypeFlatMap = uncurryThis(Array.prototype.flatMap)
const ArrayPrototypeForEach = uncurryThis(Array.prototype.forEach)
const ArrayPrototypeIncludes = uncurryThis(Array.prototype.includes)
const ArrayPrototypeIndexOf = uncurryThis(Array.prototype.indexOf)
const ArrayPrototypeJoin = uncurryThis(Array.prototype.join)
const ArrayPrototypeKeys = uncurryThis(Array.prototype.keys)
const ArrayPrototypeLastIndexOf = uncurryThis(Array.prototype.lastIndexOf)
const ArrayPrototypeMap = uncurryThis(Array.prototype.map)
const ArrayPrototypePop = uncurryThis(Array.prototype.pop)
const ArrayPrototypePush = uncurryThis(Array.prototype.push) as <T>(
  self: T[],
  ...items: T[]
) => number
const ArrayPrototypeReduce = uncurryThis(Array.prototype.reduce)
const ArrayPrototypeReduceRight = uncurryThis(Array.prototype.reduceRight)
const ArrayPrototypeReverse = uncurryThis(Array.prototype.reverse)
const ArrayPrototypeShift = uncurryThis(Array.prototype.shift)
const ArrayPrototypeSlice = uncurryThis(Array.prototype.slice)
const ArrayPrototypeSome = uncurryThis(Array.prototype.some)
const ArrayPrototypeSort = uncurryThis(Array.prototype.sort)
const ArrayPrototypeSplice = uncurryThis(Array.prototype.splice) as <T>(
  self: T[],
  start: number,
  deleteCount?: number,
  ...items: T[]
) => T[]
const ArrayPrototypeToReversed = uncurryThis(Array.prototype.toReversed)
const ArrayPrototypeToSorted = uncurryThis(Array.prototype.toSorted)
const ArrayPrototypeUnshift = uncurryThis(Array.prototype.unshift) as <T>(
  self: T[],
  ...items: T[]
) => number
const ArrayPrototypeValues = uncurryThis(Array.prototype.values)

// ─── Number ───────────────────────────────────────────────────────────
const NumberIsFinite = Number.isFinite
const NumberIsInteger = Number.isInteger
const NumberIsNaN = Number.isNaN
const NumberIsSafeInteger = Number.isSafeInteger
const NumberParseFloat = Number.parseFloat
const NumberParseInt = Number.parseInt
const NumberPrototypeToFixed = uncurryThis(Number.prototype.toFixed)
const NumberPrototypeToString = uncurryThis(Number.prototype.toString)

// ─── Object (static) ───────────────────────────────────────────────────
const ObjectAssign = Object.assign
const ObjectCreate = Object.create
const ObjectDefineProperties = Object.defineProperties
const ObjectDefineProperty = Object.defineProperty
const ObjectEntries = Object.entries
const ObjectFreeze = Object.freeze
const ObjectFromEntries = Object.fromEntries
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const ObjectGetOwnPropertyNames = Object.getOwnPropertyNames
const ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols
const ObjectGetPrototypeOf = Object.getPrototypeOf
const ObjectHasOwn = Object.hasOwn
const ObjectIs = Object.is
const ObjectIsExtensible = Object.isExtensible
const ObjectIsFrozen = Object.isFrozen
const ObjectIsSealed = Object.isSealed
const ObjectKeys = Object.keys
const ObjectPreventExtensions = Object.preventExtensions
const ObjectSeal = Object.seal
const ObjectSetPrototypeOf = Object.setPrototypeOf
const ObjectValues = Object.values

// ─── Object (prototype) ────────────────────────────────────────────────
const ObjectPrototype = Object.prototype
const ObjectPrototypeHasOwnProperty = uncurryThis(
  Object.prototype.hasOwnProperty,
)
const ObjectPrototypeIsPrototypeOf = uncurryThis(Object.prototype.isPrototypeOf)
const ObjectPrototypePropertyIsEnumerable = uncurryThis(
  Object.prototype.propertyIsEnumerable,
)
const ObjectPrototypeToString = uncurryThis(Object.prototype.toString)
const ObjectPrototypeValueOf = uncurryThis(Object.prototype.valueOf)

// ─── Reflect ───────────────────────────────────────────────────────────
const ReflectApply = Reflect.apply
const ReflectConstruct = Reflect.construct
const ReflectDefineProperty = Reflect.defineProperty
const ReflectDeleteProperty = Reflect.deleteProperty
const ReflectGet = Reflect.get
const ReflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor
const ReflectGetPrototypeOf = Reflect.getPrototypeOf
const ReflectHas = Reflect.has
const ReflectIsExtensible = Reflect.isExtensible
const ReflectOwnKeys = Reflect.ownKeys
const ReflectPreventExtensions = Reflect.preventExtensions
const ReflectSet = Reflect.set
const ReflectSetPrototypeOf = Reflect.setPrototypeOf

// ─── RegExp ────────────────────────────────────────────────────────────
const RegExpPrototypeExec = uncurryThis(RegExp.prototype.exec)
const RegExpPrototypeTest = uncurryThis(RegExp.prototype.test)
const RegExpPrototypeSymbolMatch = uncurryThis(
  RegExp.prototype[Symbol.match] as (this: RegExp, str: string) => unknown,
)
const RegExpPrototypeSymbolReplace = uncurryThis(
  RegExp.prototype[Symbol.replace] as (
    this: RegExp,
    str: string,
    replaceValue: string,
  ) => string,
)

// ─── String (static) ───────────────────────────────────────────────────
const StringFromCharCode = String.fromCharCode
const StringFromCodePoint = String.fromCodePoint
const StringRaw = String.raw

// ─── String (prototype) ────────────────────────────────────────────────
const StringPrototypeAt = uncurryThis(String.prototype.at)
const StringPrototypeCharAt = uncurryThis(String.prototype.charAt)
const StringPrototypeCharCodeAt = uncurryThis(String.prototype.charCodeAt)
const StringPrototypeCodePointAt = uncurryThis(String.prototype.codePointAt)
const StringPrototypeConcat = uncurryThis(String.prototype.concat) as (
  self: string,
  ...strs: string[]
) => string
const StringPrototypeEndsWith = uncurryThis(String.prototype.endsWith)
const StringPrototypeIncludes = uncurryThis(String.prototype.includes)
const StringPrototypeIndexOf = uncurryThis(String.prototype.indexOf)
const StringPrototypeLastIndexOf = uncurryThis(String.prototype.lastIndexOf)
const StringPrototypeLocaleCompare = uncurryThis(String.prototype.localeCompare)
const StringPrototypeMatch = uncurryThis(
  String.prototype.match as (
    this: string,
    matcher: string | RegExp,
  ) => RegExpMatchArray | null,
)
const StringPrototypeMatchAll = uncurryThis(
  String.prototype.matchAll as (
    this: string,
    matcher: RegExp | string,
  ) => IterableIterator<RegExpMatchArray>,
)
const StringPrototypeNormalize = uncurryThis(String.prototype.normalize)
const StringPrototypePadEnd = uncurryThis(String.prototype.padEnd)
const StringPrototypePadStart = uncurryThis(String.prototype.padStart)
const StringPrototypeRepeat = uncurryThis(String.prototype.repeat)
const StringPrototypeReplace = uncurryThis(String.prototype.replace)
const StringPrototypeReplaceAll = uncurryThis(
  String.prototype.replaceAll as (
    this: string,
    searchValue: string,
    replaceValue: string,
  ) => string,
)
const StringPrototypeSearch = uncurryThis(String.prototype.search)
const StringPrototypeSlice = uncurryThis(String.prototype.slice)
const StringPrototypeSplit = uncurryThis(String.prototype.split) as (
  self: string,
  separator: string | RegExp,
  limit?: number,
) => string[]
const StringPrototypeStartsWith = uncurryThis(String.prototype.startsWith)
const StringPrototypeSubstring = uncurryThis(String.prototype.substring)
const StringPrototypeToLocaleLowerCase = uncurryThis(
  String.prototype.toLocaleLowerCase,
)
const StringPrototypeToLocaleUpperCase = uncurryThis(
  String.prototype.toLocaleUpperCase,
)
const StringPrototypeToLowerCase = uncurryThis(String.prototype.toLowerCase)
const StringPrototypeToUpperCase = uncurryThis(String.prototype.toUpperCase)
const StringPrototypeTrim = uncurryThis(String.prototype.trim)
const StringPrototypeTrimEnd = uncurryThis(String.prototype.trimEnd)
const StringPrototypeTrimStart = uncurryThis(String.prototype.trimStart)

// ─── Symbol ────────────────────────────────────────────────────────────
const SymbolAsyncIterator = Symbol.asyncIterator
const SymbolFor = Symbol.for
const SymbolIterator = Symbol.iterator
const SymbolToPrimitive = Symbol.toPrimitive
const SymbolToStringTag = Symbol.toStringTag

export {
  applyBind,
  ArrayCtor,
  ArrayFrom,
  ArrayIsArray,
  ArrayOf,
  ArrayPrototypeAt,
  ArrayPrototypeConcat,
  ArrayPrototypeCopyWithin,
  ArrayPrototypeEntries,
  ArrayPrototypeEvery,
  ArrayPrototypeFill,
  ArrayPrototypeFilter,
  ArrayPrototypeFind,
  ArrayPrototypeFindIndex,
  ArrayPrototypeFindLast,
  ArrayPrototypeFindLastIndex,
  ArrayPrototypeFlat,
  ArrayPrototypeFlatMap,
  ArrayPrototypeForEach,
  ArrayPrototypeIncludes,
  ArrayPrototypeIndexOf,
  ArrayPrototypeJoin,
  ArrayPrototypeKeys,
  ArrayPrototypeLastIndexOf,
  ArrayPrototypeMap,
  ArrayPrototypePop,
  ArrayPrototypePush,
  ArrayPrototypeReduce,
  ArrayPrototypeReduceRight,
  ArrayPrototypeReverse,
  ArrayPrototypeShift,
  ArrayPrototypeSlice,
  ArrayPrototypeSome,
  ArrayPrototypeSort,
  ArrayPrototypeSplice,
  ArrayPrototypeToReversed,
  ArrayPrototypeToSorted,
  ArrayPrototypeUnshift,
  ArrayPrototypeValues,
  BooleanCtor,
  DateCtor,
  decodeComponent,
  encodeComponent,
  ErrorCtor,
  JSONParse,
  JSONStringify,
  MapCtor,
  NumberCtor,
  NumberIsFinite,
  NumberIsInteger,
  NumberIsNaN,
  NumberIsSafeInteger,
  NumberParseFloat,
  NumberParseInt,
  NumberPrototypeToFixed,
  NumberPrototypeToString,
  ObjectAssign,
  ObjectCreate,
  ObjectCtor,
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectEntries,
  ObjectFreeze,
  ObjectFromEntries,
  ObjectGetOwnPropertyDescriptor,
  ObjectGetOwnPropertyDescriptors,
  ObjectGetOwnPropertyNames,
  ObjectGetOwnPropertySymbols,
  ObjectGetPrototypeOf,
  ObjectHasOwn,
  ObjectIs,
  ObjectIsExtensible,
  ObjectIsFrozen,
  ObjectIsSealed,
  ObjectKeys,
  ObjectPreventExtensions,
  ObjectPrototype,
  ObjectPrototypeHasOwnProperty,
  ObjectPrototypeIsPrototypeOf,
  ObjectPrototypePropertyIsEnumerable,
  ObjectPrototypeToString,
  ObjectPrototypeValueOf,
  ObjectSeal,
  ObjectSetPrototypeOf,
  ObjectValues,
  PromiseCtor,
  ReflectApply,
  ReflectConstruct,
  ReflectDefineProperty,
  ReflectDeleteProperty,
  ReflectGet,
  ReflectGetOwnPropertyDescriptor,
  ReflectGetPrototypeOf,
  ReflectHas,
  ReflectIsExtensible,
  ReflectOwnKeys,
  ReflectPreventExtensions,
  ReflectSet,
  ReflectSetPrototypeOf,
  RegExpCtor,
  RegExpPrototypeExec,
  RegExpPrototypeSymbolMatch,
  RegExpPrototypeSymbolReplace,
  RegExpPrototypeTest,
  SetCtor,
  StringCtor,
  StringFromCharCode,
  StringFromCodePoint,
  StringPrototypeAt,
  StringPrototypeCharAt,
  StringPrototypeCharCodeAt,
  StringPrototypeCodePointAt,
  StringPrototypeConcat,
  StringPrototypeEndsWith,
  StringPrototypeIncludes,
  StringPrototypeIndexOf,
  StringPrototypeLastIndexOf,
  StringPrototypeLocaleCompare,
  StringPrototypeMatch,
  StringPrototypeMatchAll,
  StringPrototypeNormalize,
  StringPrototypePadEnd,
  StringPrototypePadStart,
  StringPrototypeRepeat,
  StringPrototypeReplace,
  StringPrototypeReplaceAll,
  StringPrototypeSearch,
  StringPrototypeSlice,
  StringPrototypeSplit,
  StringPrototypeStartsWith,
  StringPrototypeSubstring,
  StringPrototypeToLocaleLowerCase,
  StringPrototypeToLocaleUpperCase,
  StringPrototypeToLowerCase,
  StringPrototypeToUpperCase,
  StringPrototypeTrim,
  StringPrototypeTrimEnd,
  StringPrototypeTrimStart,
  StringRaw,
  SymbolAsyncIterator,
  SymbolCtor,
  SymbolFor,
  SymbolIterator,
  SymbolToPrimitive,
  SymbolToStringTag,
  uncurryThis,
  URLCtor,
  URLSearchParamsCtor,
  WeakMapCtor,
  WeakRefCtor,
  WeakSetCtor,
}
