/**
 * @file Safe references to Node's `Buffer` global. `Buffer` is a Node-only
 *   global; in browsers and Deno (without compatibility shim) the captured
 *   references are `undefined`. Cross- env consumers must null-check before
 *   calling.
 */

import { uncurryThis } from './uncurry'

// BufferCtor is a Node-only global; `undefined` in the browser. Callers
// that import it in browser code get a type-safe `undefined` rather than
// a runtime ReferenceError.
export const BufferCtor: typeof globalThis.Buffer | undefined = (
  globalThis as { Buffer?: typeof globalThis.Buffer | undefined }
).Buffer

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
// BufferCtor undefined arm fires only on runtimes without Buffer.
/* c8 ignore start */
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
/* c8 ignore stop */
