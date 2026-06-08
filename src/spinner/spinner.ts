/**
 * @file Spinner factory — lazily builds the Socket `Spinner` class that wraps
 *   `yocto-spinner` with Socket-specific behaviors (custom RGB color pipeline,
 *   shimmer, progress bar, indented step messages, status methods that don't
 *   auto-stop, *AndStop variants that auto-clear). The class graph is
 *   constructed by `createSpinnerClass()` so the `super()` call binds against
 *   the live `YoctoSpinner` constructor resolved here; building it lazily keeps
 *   the module free of side effects at import time.
 */

import { getCI } from '../env/ci'
import yoctoSpinner from '../external/@socketregistry/yocto-spinner'
import { getDefaultLogger } from '../logger/default'

import type {
  SpinnerCtorType,
  SpinnerLogger,
  YoctoSpinnerConstructor,
} from './create-spinner-class'
import { createSpinnerClass } from './create-spinner-class'
import { getCliSpinners } from './default'
import { ciSpinner } from './format'

import type { SpinnerInstance, SpinnerOptions, SpinnerStyle } from './types'

export type YoctoSpinnerFactory = (options: Record<string, unknown>) => {
  constructor: YoctoSpinnerConstructor
}

let SpinnerCtor: SpinnerCtorType | undefined
let defaultSpinnerStyle: SpinnerStyle | undefined

/**
 * Create a spinner instance for displaying loading indicators. Provides an
 * animated CLI spinner with status messages, progress tracking, and shimmer
 * effects.
 *
 * AUTO-CLEAR BEHAVIOR:
 *
 * - All *AndStop() methods AUTO-CLEAR the spinner line via yocto-spinner.stop()
 *   Examples: `doneAndStop()`, `successAndStop()`, `failAndStop()`, etc.
 * - Methods WITHOUT "AndStop" do NOT clear (spinner keeps spinning) Examples:
 *   `done()`, `success()`, `fail()`, etc.
 *
 * STREAM USAGE:
 *
 * - Spinner animation: stderr (yocto-spinner default)
 * - Status methods (done, success, fail, info, warn, step, substep): stderr
 * - Data methods (`log()`): stdout
 *
 * COMPARISON WITH LOGGER:
 *
 * - `logger.done()` does NOT auto-clear (requires manual `logger.clearLine()`)
 * - `spinner.doneAndStop()` DOES auto-clear (built into yocto-spinner.stop())
 * - Pattern: `logger.clearLine().done()` vs `spinner.doneAndStop()`
 *
 * @param options - Configuration options for the spinner.
 *
 * @returns New spinner instance
 */
export function Spinner(options?: SpinnerOptions | undefined): SpinnerInstance {
  if (SpinnerCtor === undefined) {
    /* c8 ignore start - external yoctoSpinner initialization */
    const yoctoFactory = yoctoSpinner as unknown as YoctoSpinnerFactory
    // Get the actual YoctoSpinner class from an instance.
    const tempInstance = yoctoFactory({})
    const YoctoSpinnerClass = tempInstance.constructor
    /* c8 ignore stop */
    const logger = getDefaultLogger() as unknown as SpinnerLogger

    SpinnerCtor = createSpinnerClass(YoctoSpinnerClass, logger)

    // CI vs interactive spinner; getCI() returns false in test runs.
    /* c8 ignore start - getCI() returns false in test runs so the CI arm is unexercised */
    defaultSpinnerStyle = getCI()
      ? ciSpinner
      : (getCliSpinners('socket') as SpinnerStyle)
    /* c8 ignore stop */
  }
  return new SpinnerCtor({
    spinner: defaultSpinnerStyle,
    ...options,
  })
}
