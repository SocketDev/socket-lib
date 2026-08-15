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
// Guarded capture: `SharedArrayBuffer` is NOT a defined global everywhere —
// browsers without cross-origin isolation don't expose it, and V8's
// `--build-snapshot` builder context omits it — so a bare reference here was
// a module-eval ReferenceError in both. Same capture-once-at-load semantics
// wherever the global exists; consumers own the undefined case.
export const SharedArrayBufferCtor: SharedArrayBufferConstructor | undefined =
  typeof SharedArrayBuffer === 'undefined' ? undefined : SharedArrayBuffer

// ─── Global values ─────────────────────────────────────────────────────
// `Infinity` and `NaN` are the language's two non-finite number primitives.
// They are non-writable / non-configurable on globalThis since ES5, so the
// captured value is guaranteed to match the live global. Re-exported here
// for symmetry with `NumberPOSITIVE_INFINITY` / `NumberNaN`.
export const InfinityValue: number = Infinity
export const NaNValue: number = NaN
// Captured `globalThis` reference. Re-exported under the natural name
// `globalThis` so consumers can pull it via the same alias-at-import
// pattern they use for other captured globals:
//   `import { globalThis as GlobalThis } from '@socketsecurity/lib/primordials/globals'`
const capturedGlobalThis: typeof globalThis = globalThis
export { capturedGlobalThis as globalThis }

// ─── Captured globals (functions / methods) ────────────────────────────
// Base64 + URI codecs are non-method globals; we capture them at module
// load so consumers reading adversarial input never see a tampered
// global. Exports keep their natural names; consumers rename via the
// alias map at import time (e.g. `import { atob as GlobalAtob }`).
export const atob = globalThis.atob
export const btoa = globalThis.btoa
export const decodeURIComponent = globalThis.decodeURIComponent
export const encodeURIComponent = globalThis.encodeURIComponent
