/**
 * @file Safe references to `Error` and its subclass constructors, plus V8's
 *   stack-trace API. `Error.isError` is ES2025; `captureStackTrace` /
 *   `prepareStackTrace` / `stackTraceLimit` are V8 extensions absent on
 *   JavaScriptCore and SpiderMonkey. Each is typed `Function | undefined` so
 *   non-V8 importers stay safe.
 */

export const ErrorCtor: ErrorConstructor = Error
// Error subclasses commonly thrown in validation paths.
export const AggregateErrorCtor: AggregateErrorConstructor = AggregateError
export const EvalErrorCtor: EvalErrorConstructor = EvalError
export const RangeErrorCtor: RangeErrorConstructor = RangeError
export const ReferenceErrorCtor: ReferenceErrorConstructor = ReferenceError
export const SyntaxErrorCtor: SyntaxErrorConstructor = SyntaxError
export const TypeErrorCtor: TypeErrorConstructor = TypeError
export const URIErrorCtor: URIErrorConstructor = URIError

// ─── Error (static) ────────────────────────────────────────────────────
// `Error.isError` is ES2025 (Node 22.18+). Older Node falls back to
// `instanceof Error` via the polyfill in src/errors.ts. The primordial
// reference is typed `Function | undefined` so callers in older
// environments don't crash at import time.
export const ErrorIsError: ((value: unknown) => value is Error) | undefined = (
  Error as { isError?: ((v: unknown) => v is Error) | undefined }
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
    captureStackTrace?:
      | ((targetObject: object, constructorOpt?: Function) => void)
      | undefined
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
    prepareStackTrace?:
      | ((error: Error, structuredStackTrace: NodeJS.CallSite[]) => unknown)
      | undefined
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
const stackTraceLimitGetter: (() => number) | undefined = (() => {
  const getter = (
    Error as unknown as {
      __lookupGetter__?: (key: string) => (() => number) | undefined
    }
  ).__lookupGetter__?.('stackTraceLimit')
  // V8 always exposes __lookupGetter__ for Error.stackTraceLimit.
  /* c8 ignore start */
  if (typeof getter === 'function') {
    return () => getter.call(Error)
  }
  return undefined
  /* c8 ignore stop */
})()
export function ErrorStackTraceLimit(): number | undefined {
  // stackTraceLimitGetter is always set on V8.
  /* c8 ignore start - non-V8 fallback path unreachable under test */
  if (stackTraceLimitGetter) {
    return stackTraceLimitGetter()
  }
  return (Error as { stackTraceLimit?: number | undefined }).stackTraceLimit
  /* c8 ignore stop */
}
