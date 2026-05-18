/**
 * @file Safe references to top-level globals that don't fit a larger
 *   primordials leaf — primitive constructors (`Boolean`, `BigInt`), `Proxy`,
 *   `SharedArrayBuffer`, language-level constants (`Infinity`, `NaN`,
 *   `globalThis`), and the encode/decode helpers. Every reference is captured
 *   once at module load so consumers reading adversarial input never see a
 *   tampered global.
 */

export const BigIntCtor: BigIntConstructor = BigInt
export const BooleanCtor: BooleanConstructor = Boolean
export const ProxyCtor: ProxyConstructor = Proxy
export const SharedArrayBufferCtor: SharedArrayBufferConstructor =
  SharedArrayBuffer

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
