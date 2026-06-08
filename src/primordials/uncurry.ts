/**
 * @file `uncurryThis` and the cluster of helpers built atop it. Mirrors
 *   Node.js's internal/per_context/primordials.js. Every other primordials leaf
 *   depends on `uncurryThis` to expose prototype-method primordials, so this
 *   file must be import-safe before any of them. Smol fast paths
 *   (`node:smol-util`) replace the JS forms when running on socket-btm's smol
 *   Node binary; stock Node and other runtimes fall back to the standard
 *   `bind.bind(call)` shape. **IMPORTANT**: do not destructure on `globalThis`
 *   or `Reflect` here. tsgo has a bug that mis-transpiles destructured exports.
 *   See: https://github.com/SocketDev/socket-packageurl-js/issues/3.
 */

import { getSmolUtil } from '../smol/detect'

const smolUtil = getSmolUtil()

// ─── uncurryThis ───────────────────────────────────────────────────────
// Mirrors Node.js internal/per_context/primordials.js:
//   const { apply, bind, call } = Function.prototype
//   const uncurryThis = bind.bind(call)
const { apply, bind, call } = Function.prototype
export const uncurryThis =
  smolUtil?.uncurryThis ??
  (bind.bind(call) as <T, A extends readonly unknown[], R>(
    fn: (this: T, ...args: A) => R,
  ) => (self: T, ...args: A) => R)
export const applyBind =
  smolUtil?.applyBind ??
  (bind.bind(apply) as <T, A extends readonly unknown[], R>(
    fn: (this: T, ...args: A) => R,
  ) => (self: T, args: A) => R)

// ─── applySafe ─────────────────────────────────────────────────────────
// Native form skips JS-level throw construction on the swallow path.
// JS fallback is the obvious shape: applyBind + try/catch around the
// inner call. Used by logger sinks, debug hooks, abort handlers — any
// place where the callee is untrusted user code and the host doesn't
// care whether it threw.
const applyBoundForSafe = applyBind
export const applySafe: <T, A extends readonly unknown[], R>(
  fn: (this: T, ...args: A) => R,
) => (self: T, args: A) => R | undefined =
  smolUtil?.applySafe ??
  (<T, A extends readonly unknown[], R>(fn: (this: T, ...args: A) => R) => {
    const apply2 = applyBoundForSafe(fn)
    return (self: T, args: A): R | undefined => {
      try {
        return apply2(self, args)
      } catch {
        return undefined
      }
    }
  })

// ─── bindCall ──────────────────────────────────────────────────────────
// Native form is single-dispatch; JS fallback is `Function.prototype.bind`,
// which goes through V8's BoundFunction adapter on every invocation.
// 2x per call when the bound function is hot.
export type BindCall = <
  T,
  P extends readonly unknown[],
  A extends readonly unknown[],
  R,
>(
  fn: (this: T, ...args: [...P, ...A]) => R,
  thisArg: T,
  ...presetArgs: P
) => (...newArgs: A) => R
const bindCallFallback = ((
  fn: (...a: unknown[]) => unknown,
  thisArg: unknown,
  ...presetArgs: unknown[]
) =>
  Function.prototype.bind.apply(fn, [
    thisArg,
    ...presetArgs,
  ])) as unknown as BindCall
export const bindCall: BindCall = smolUtil?.bindCall ?? bindCallFallback

// ─── weakRefSafe ───────────────────────────────────────────────────────
// `new WeakRef(target)` throws for non-Object, non-Symbol inputs. The
// Safe form predicates the input first and returns `undefined` for
// non-wrappable values without paying exception-construction cost.
export const weakRefSafe: <T extends object | symbol>(
  target: T,
) => WeakRef<T> | undefined =
  smolUtil?.weakRefSafe ??
  (<T extends object | symbol>(target: T): WeakRef<T> | undefined => {
    try {
      return new WeakRef(target)
    } catch {
      return undefined
    }
  })
