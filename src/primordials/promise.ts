/**
 * @file Safe references to `Promise` static methods, prototype methods, and the
 *   ES2024 `withResolvers` factory. Static methods are bound to `Promise` so
 *   callers can pass them around as standalone functions (`PromiseAll(arr)`
 *   instead of `Promise.all(arr)`); the `this`-receiver capture matches Node's
 *   primordials convention.
 */

import { uncurryThis } from './uncurry'

export const PromiseCtor: PromiseConstructor = Promise

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
