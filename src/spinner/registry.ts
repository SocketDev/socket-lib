/**
 * @file Spinner-style registry — exposes the union of the standard
 *   `cli-spinners` collection and Socket's custom `socket` pulse animation,
 *   plus a lazy default-spinner singleton. The registry itself is built once
 *   and memoized; `getDefaultSpinner()` defers `Spinner()` construction until
 *   first call so module initialization stays cheap.
 */

import { generateSocketSpinnerFrames } from '../effects/pulse-frames'
import yoctoSpinner from '../external/@socketregistry/yocto-spinner'
import { hasOwn } from '../objects/predicates'

import { Spinner } from './spinner'

import type { SpinnerInstance, SpinnerStyle } from './types'

let _cliSpinners: Record<string, SpinnerStyle> | undefined
let _spinner: SpinnerInstance | undefined

/**
 * Get available CLI spinner styles or a specific style by name. Extends the
 * standard cli-spinners collection with Socket custom spinners.
 *
 * Custom spinners: - `socket` (default): Socket pulse animation with sparkles
 * and lightning.
 *
 * @example
 *   ;```ts
 *   // Get all available spinner styles
 *   const allSpinners = getCliSpinners()
 *
 *   // Get specific style
 *   const socketStyle = getCliSpinners('socket')
 *   const dotsStyle = getCliSpinners('dots')
 *   ```
 *
 * @param styleName - Optional name of specific spinner style to retrieve.
 *
 * @returns Specific spinner style if name provided, all styles if omitted,
 *   `undefined` if style not found.
 *
 * @see https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json
 */
/*@__NO_SIDE_EFFECTS__*/
export function getCliSpinners(
  styleName?: string | undefined,
): SpinnerStyle | Record<string, SpinnerStyle> | undefined {
  if (_cliSpinners === undefined) {
    /* c8 ignore start - External yoctoSpinner initialization */
    const YoctoCtor: any = yoctoSpinner as any
    // Get the YoctoSpinner class to access static properties.
    const tempInstance: any = YoctoCtor({})
    const YoctoSpinnerClass: any = tempInstance.constructor as any
    /* c8 ignore stop */
    // Extend the standard cli-spinners collection with Socket custom spinners.
    _cliSpinners = {
      __proto__: null,
      ...YoctoSpinnerClass.spinners,
      socket: generateSocketSpinnerFrames(),
    }
  }
  if (typeof styleName === 'string' && _cliSpinners) {
    return hasOwn(_cliSpinners, styleName) ? _cliSpinners[styleName] : undefined
  }
  return _cliSpinners
}

/**
 * Get the default spinner instance. Lazily creates the spinner to avoid
 * circular dependencies during module initialization. Reuses the same instance
 * across calls.
 *
 * @example
 *   ;```ts
 *   import { getDefaultSpinner } from '@socketsecurity/lib/spinner/registry'
 *
 *   const spinner = getDefaultSpinner()
 *   spinner.start('Loading…')
 *   ```
 *
 * @returns Shared default spinner instance
 */
export function getDefaultSpinner(): SpinnerInstance {
  if (_spinner === undefined) {
    _spinner = Spinner()
  }
  return _spinner
}
