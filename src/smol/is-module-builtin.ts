/**
 * @fileoverview `isModuleBuiltin(name)` — thin wrapper around
 * `node:module`'s `isBuiltin(name)` for use as the per-module gate
 * before `require('node:smol-*')`.
 *
 * Why it exists:
 *   The smol loaders (`getSmolManifest`, `getSmolPurl`, `getSmolVfs`,
 *   `getSmolVersions`, `getSmolPrimordial`, `getSmolUtil`) all need
 *   to answer "is this specific `node:smol-*` binding registered on
 *   this binary." `isBuiltin` is the cheapest and most accurate way
 *   to ask — sharper than wrapping the require in a `try/catch` and
 *   absorbing every failure mode into one branch.
 *
 *   `node:module.isBuiltin` exists in Node 18.6.0+ which is socket-
 *   lib's lower bound, so the lookup is reliable. The `require` is
 *   cached at module init so per-call cost is one function call.
 */

import { isBuiltin } from 'node:module'

/*@__NO_SIDE_EFFECTS__*/
export function isModuleBuiltin(name: string): boolean {
  return isBuiltin(name)
}
