/**
 * @file GENERATED — do not edit by hand. Run `node
 *   scripts/post-build/make-primordials-defaults.mts` (also runs as part of
 *   `pnpm run build`) to regenerate from the `globals` npm package's
 *   globals.json crossed against src/primordials/*.ts `Ctor` exports. Source:
 *   globals@<bumped via taze>, env = builtin ∪ node. Filter: identifiers
 *   socket-lib exports as `<name>Ctor`.
 */

import { ObjectFreeze } from '../primordials/object'

/**
 * Fleet-canonical alias map: socket-lib mirrors standard JS + Node globals with
 * a `Ctor` suffix. Downstream repos that destructure raw `primordials` use this
 * map to resolve the source-side name to socket-lib's export.
 */
export const DEFAULT_ALIAS_MAP: Readonly<Record<string, string>> = ObjectFreeze(
  {
    __proto__: null,
    AggregateError: 'AggregateErrorCtor',
    Array: 'ArrayCtor',
    ArrayBuffer: 'ArrayBufferCtor',
    BigInt: 'BigIntCtor',
    Boolean: 'BooleanCtor',
    Buffer: 'BufferCtor',
    DataView: 'DataViewCtor',
    Date: 'DateCtor',
    Error: 'ErrorCtor',
    EvalError: 'EvalErrorCtor',
    Float32Array: 'Float32ArrayCtor',
    Float64Array: 'Float64ArrayCtor',
    Int16Array: 'Int16ArrayCtor',
    Int32Array: 'Int32ArrayCtor',
    Int8Array: 'Int8ArrayCtor',
    Map: 'MapCtor',
    Number: 'NumberCtor',
    Object: 'ObjectCtor',
    Promise: 'PromiseCtor',
    Proxy: 'ProxyCtor',
    RangeError: 'RangeErrorCtor',
    ReferenceError: 'ReferenceErrorCtor',
    RegExp: 'RegExpCtor',
    Set: 'SetCtor',
    SharedArrayBuffer: 'SharedArrayBufferCtor',
    String: 'StringCtor',
    Symbol: 'SymbolCtor',
    SyntaxError: 'SyntaxErrorCtor',
    TypeError: 'TypeErrorCtor',
    URIError: 'URIErrorCtor',
    URL: 'URLCtor',
    URLSearchParams: 'URLSearchParamsCtor',
    Uint16Array: 'Uint16ArrayCtor',
    Uint32Array: 'Uint32ArrayCtor',
    Uint8Array: 'Uint8ArrayCtor',
    Uint8ClampedArray: 'Uint8ClampedArrayCtor',
    WeakMap: 'WeakMapCtor',
    WeakRef: 'WeakRefCtor',
    WeakSet: 'WeakSetCtor',
    atob: 'GlobalAtob',
    btoa: 'GlobalBtoa',
    decodeURIComponent: 'GlobalDecodeUriComponent',
    encodeURIComponent: 'GlobalEncodeUriComponent',
    globalThis: 'GlobalThis',
  },
) as unknown as Readonly<Record<string, string>>

/**
 * Names that exist in Node's internal `primordials` but are intentionally NOT
 * mirrored to socket-lib (mostly Safe* wrappers and prototype-method aliases).
 * Adding to this set is a per-name decision; the list is hand-maintained.
 */
export const DEFAULT_NODE_INTERNAL_ONLY: readonly string[] = ObjectFreeze([
  'DataViewPrototypeGetInt32',
  'DataViewPrototypeGetUint32',
  'SafeMap',
  'SafePromise',
  'SafePromiseAllReturnVoid',
  'SafePromiseAllSettled',
  'SafeSet',
  'SafeWeakMap',
  'SafeWeakSet',
]) as readonly string[]
