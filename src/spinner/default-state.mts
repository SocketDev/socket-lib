/**
 * @file The default-spinner singleton's storage, split out from
 *   `default.mts` so a caller that only needs to _peek_ at whether a default
 *   spinner already exists never pays for constructing one. `default.mts`
 *   (and everything behind it — `spinner.mts`, `yocto-spinner`) is only
 *   loaded once `getDefaultSpinner()` actually runs; this module has no
 *   runtime imports at all.
 */

import type { SpinnerInstance } from './types.mjs'

let spinner: SpinnerInstance | undefined

/**
 * The default spinner instance if one has already been created, or
 * `undefined` if `getDefaultSpinner()` has never run. Never constructs one —
 * safe to call from a module that cannot afford to load the spinner
 * subsystem.
 *
 * @returns The existing default spinner instance, or `undefined`.
 */
export function peekDefaultSpinner(): SpinnerInstance | undefined {
  return spinner
}

/**
 * Record the default spinner singleton. Called by `getDefaultSpinner()`
 * after it constructs one.
 *
 * @param instance - The spinner instance to store as the default.
 */
export function setDefaultSpinner(instance: SpinnerInstance): void {
  spinner = instance
}
