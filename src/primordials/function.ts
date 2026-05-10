/**
 * @fileoverview Safe references to `Function.prototype` methods.
 *
 * `apply`, `bind`, `call`, `toString` — used by reflection-heavy code
 * paths (logger sinks, lazy bindings, debug formatters) where calling
 * the global builtin without a captured reference would expose to
 * prototype tampering.
 */

import { uncurryThis } from './uncurry'

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
