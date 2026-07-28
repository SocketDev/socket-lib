/**
 * @file Builds the lazy-init Socket `Spinner` class that extends the live
 *   `yocto-spinner` constructor. The class graph is constructed inside
 *   `createSpinnerClass()` so the `super()` call binds against the runtime
 *   `YoctoSpinner` constructor passed in by the factory; keeping it here
 *   (rather than at module scope) preserves the spinner's lazy-init guarantee
 *   while splitting the bulk of the class body out of the factory module.
 */

import type { ColorRgb, ColorValue } from '../colors/types'
import { isRgbTuple, toRgb } from '../colors/convert'
import { getAbortSignal } from '../process/abort'
import {
  incLogCallCountSymbol,
  lastWasBlankSymbol,
  LOG_SYMBOLS,
} from '../logger/symbols'
import { ArrayPrototypeAt, ArrayPrototypeSlice } from '../primordials/array'
import { MathMax } from '../primordials/math'
import { ObjectDefineProperties } from '../primordials/object'
import { isBlankString } from '../strings/predicates'
import { stringWidth } from '../strings/width'

import { desc, formatProgress, normalizeText } from './format'
import {
  applyShimmer,
  parseShimmerOption,
  resolveSpinnerColorRgb,
} from './spinner-internals'
import {
  getSavedShimmerSymbol,
  getShimmerSymbol,
  installShimmerMethods,
  setSavedShimmerSymbol,
  setShimmerSymbol,
  updateTextSymbol,
} from './spinner-shimmer-methods'
import {
  applyStatusSymbol,
  installStatusMethods,
  showStatusSymbol,
} from './spinner-status-methods'

import type {
  ProgressInfo,
  ShimmerInfo,
  SpinnerInstance,
  SpinnerOptions,
  SymbolType,
} from './types'

export type SpinnerCtorType = {
  new (options?: SpinnerOptions | undefined): SpinnerInstance
}

export type YoctoSpinnerConstructor = new (...args: unknown[]) => {
  // `color` and `text` are typed as accessors (get/set pairs) rather than
  // plain properties so SpinnerClass can override them with its own
  // RGB-narrowing accessor / getter-setter method overloads — TypeScript
  // forbids overriding a base *property* with a subclass *accessor*
  // (TS2611), but allows accessor-over-accessor.
  get color(): ColorRgb | ColorValue
  set color(value: ColorRgb | ColorValue)
  // `text` is intentionally NOT modeled as a named member: yocto-spinner
  // exposes it as a property, but SpinnerClass owns the public `text()`
  // getter/setter method, and TypeScript forbids overriding a base property
  // with a subclass method. The base `text` is reached through the index
  // signature, so internal writes use `super['text']` (bracket access).
  isSpinning: boolean
  [key: string]: unknown
}

export type SpinnerLogger = {
  error: (...args: unknown[]) => unknown
  log: (...args: unknown[]) => unknown
  [lastWasBlankSymbol]: (value: boolean) => unknown
  [incLogCallCountSymbol]: () => unknown
}

/**
 * Build the Socket `Spinner` class as a subclass of the live `yocto-spinner`
 * constructor. Passing the parent class in keeps the `super()` binding against
 * the runtime constructor while letting the bulk of the class body live outside
 * the factory module.
 *
 * @param YoctoSpinnerClass - Runtime `yocto-spinner` constructor to extend.
 * @param logger - Default logger used for status output.
 *
 * @returns The constructed Socket spinner constructor.
 */
export function createSpinnerClass(
  YoctoSpinnerClass: YoctoSpinnerConstructor,
  logger: SpinnerLogger,
): SpinnerCtorType {
  const SpinnerCtor = class SpinnerClass extends YoctoSpinnerClass {
    declare isSpinning: boolean
    #baseText: string = ''
    #indentation: string = ''
    #progress?: ProgressInfo | undefined
    #shimmer?: ShimmerInfo | undefined
    #shimmerSavedConfig?: ShimmerInfo | undefined

    constructor(ctorOptions?: SpinnerOptions | undefined) {
      const opts = { __proto__: null, ...ctorOptions } as SpinnerOptions

      const spinnerColorRgb = resolveSpinnerColorRgb(opts)

      // Parse shimmer config - can be object or direction string.
      const shimmerInfo = parseShimmerOption(opts.shimmer)

      super({
        signal: getAbortSignal(),
        ...opts,
        // Pass RGB color directly to yocto-spinner (it now supports RGB).
        color: spinnerColorRgb,
        // onRenderFrame callback provides full control over frame + text layout.
        // Calculates spacing based on frame width to prevent text jumping.
        onRenderFrame: (
          frame: string,
          text: string,
          applyColor: (text: string) => string,
        ) => {
          const width = stringWidth(frame)
          // Narrow frames (width 1) get 2 spaces, wide frames (width 2) get 1 space.
          // Total width is consistent: 3 characters (frame + spacing) before text.
          const spacing = width === 1 ? '  ' : ' '
          return frame ? `${applyColor(frame)}${spacing}${text}` : text
        },
        // onFrameUpdate callback is called by yocto-spinner whenever a frame advances.
        // This ensures shimmer updates are perfectly synchronized with animation beats.
        onFrameUpdate: shimmerInfo
          ? () => {
              // Update parent's text without triggering render.
              // Parent's #skipRender flag prevents nested render calls.
              // Only update if we have base text to avoid blank frames.
              if (this.#baseText) {
                super['text'] = this.#buildDisplayText()
              }
            }
          : undefined,
      })

      this.#shimmer = shimmerInfo
      this.#shimmerSavedConfig = shimmerInfo
    }

    // Override color getter to ensure it's always RGB.
    override get color(): ColorRgb {
      const value = super.color
      return isRgbTuple(value) ? value : toRgb(value)
    }

    // Override color setter to always convert to RGB before passing to yocto-spinner.
    override set color(value: ColorValue | ColorRgb) {
      super.color = isRgbTuple(value) ? value : toRgb(value)
    }

    /**
     * Apply a yocto-spinner method and update logger state. Handles text
     * normalization, extra arguments, and logger tracking. Exposed under
     * `applyStatusSymbol` so the status methods installed from
     * `spinner-status-methods.ts` can drive it.
     */
    [applyStatusSymbol](methodName: string, args: unknown[]) {
      let extras: unknown[]
      let text = ArrayPrototypeAt(args, 0)
      if (typeof text === 'string') {
        extras = ArrayPrototypeSlice(args, 1)
      } else {
        extras = args
        text = ''
      }
      const wasSpinning = this.isSpinning
      const normalized = normalizeText(text)
      // Dynamic dispatch to a base yocto-spinner method; the base type's
      // index signature is `unknown`, so cast to a callable locally.
      const superMethod = super[methodName] as unknown as (
        ...args: unknown[]
      ) => unknown
      if (methodName === 'stop' && !normalized) {
        superMethod.call(this)
      } else {
        superMethod.call(this, normalized)
      }
      if (methodName === 'stop') {
        if (wasSpinning && normalized) {
          logger[lastWasBlankSymbol](isBlankString(normalized))
          logger[incLogCallCountSymbol]()
        }
      } else {
        logger[lastWasBlankSymbol](false)
        logger[incLogCallCountSymbol]()
      }
      /* c8 ignore start - extras-empty no-op arm fires when log called without extras */
      if (extras.length) {
        logger.log(...extras)
        logger[lastWasBlankSymbol](false)
      }
      /* c8 ignore stop */
      return this
    }

    /**
     * Build the complete display text with progress, shimmer, and indentation.
     * Combines base text, progress bar, shimmer effects, and indentation.
     *
     * @private
     */
    #buildDisplayText() {
      let displayText = this.#baseText

      /* c8 ignore start - progress + shimmer paths fire only when caller seeded those configs */
      if (this.#progress) {
        const progressText = formatProgress(this.#progress)
        displayText = displayText
          ? `${displayText} ${progressText}`
          : progressText
      }

      if (displayText && this.#shimmer) {
        displayText = applyShimmer(displayText, this.#shimmer, this.color)
      }

      // Indentation arm fires only when caller calls indent().
      if (this.#indentation && displayText) {
        displayText = this.#indentation + displayText
      }
      /* c8 ignore stop */

      return displayText
    }

    /**
     * Show a status message without stopping the spinner. Outputs the symbol
     * and message to stderr, then continues spinning. Exposed under
     * `showStatusSymbol` so the status methods installed from
     * `spinner-status-methods.ts` can drive it.
     */
    [showStatusSymbol](symbolType: SymbolType, args: unknown[]) {
      let text = ArrayPrototypeAt(args, 0)
      let extras: unknown[]
      if (typeof text === 'string') {
        extras = ArrayPrototypeSlice(args, 1)
      } else {
        extras = args
        text = ''
      }

      // Note: Status messages always go to stderr.
      logger.error(`${LOG_SYMBOLS[symbolType]} ${text}`, ...extras)
      return this
    }

    /**
     * Update the spinner's displayed text. Rebuilds display text and triggers
     * render.
     *
     * @private
     */
    #updateSpinnerText() {
      // Call the parent class's text setter, which triggers render.
      super['text'] = this.#buildDisplayText()
    }

    // Expose the shimmer state + render helper under well-known symbols so the
    // shimmer methods installed from `spinner-shimmer-methods.ts` can read and
    // write the private fields without crossing the private-field boundary.
    [getShimmerSymbol]() {
      return this.#shimmer
    }

    [setShimmerSymbol](value: ShimmerInfo | undefined) {
      this.#shimmer = value
    }

    [getSavedShimmerSymbol]() {
      return this.#shimmerSavedConfig
    }

    [setSavedShimmerSymbol](value: ShimmerInfo | undefined) {
      this.#shimmerSavedConfig = value
    }

    [updateTextSymbol]() {
      this.#updateSpinnerText()
    }

    /**
     * Decrease indentation level by removing spaces from the left. Pass 0 to
     * reset indentation to zero completely.
     *
     * @default spaces=2
     *
     * @param spaces - Number of spaces to remove.
     *
     * @returns This spinner for chaining
     */
    dedent(spaces?: number | undefined) {
      // Pass 0 to reset indentation
      if (spaces === 0) {
        this.#indentation = ''
      } else {
        const amount = spaces ?? 2
        const newLength = MathMax(0, this.#indentation.length - amount)
        this.#indentation = this.#indentation.slice(0, newLength)
      }
      this.#updateSpinnerText()
      return this
    }

    /**
     * Increase indentation level by adding spaces to the left. Pass 0 to reset
     * indentation to zero completely.
     *
     * @default spaces=2
     *
     * @param spaces - Number of spaces to add.
     *
     * @returns This spinner for chaining
     */
    indent(spaces?: number | undefined) {
      /* c8 ignore start - spaces===0 fires when caller passes 0; else-branch + default fire for omitted/non-zero */
      if (spaces === 0) {
        this.#indentation = ''
      } else {
        const amount = spaces ?? 2
        this.#indentation += ' '.repeat(amount)
      }
      /* c8 ignore stop */
      this.#updateSpinnerText()
      return this
    }

    /**
     * Update progress information displayed with the spinner. Shows a progress
     * bar with percentage and optional unit label.
     *
     * @param current - Current progress value.
     * @param total - Total/maximum progress value.
     * @param unit - Optional unit label (e.g., 'files', 'items')
     *
     * @returns This spinner for chaining
     */
    progress = (current: number, total: number, unit?: string | undefined) => {
      this.#progress = {
        __proto__: null,
        current,
        total,
        ...(unit ? { unit } : {}),
      } as ProgressInfo
      this.#updateSpinnerText()
      return this
    }

    /**
     * Increment progress by a specified amount. Updates the progress bar
     * displayed with the spinner. Clamps the result between 0 and the total
     * value.
     *
     * @default amount=1
     *
     * @param amount - Amount to increment by.
     *
     * @returns This spinner for chaining
     */
    progressStep(amount: number = 1) {
      /* c8 ignore start - no-progress no-op fires before progress() seed; unit-spread arm fires when seeded with unit */
      if (this.#progress) {
        const newCurrent = this.#progress.current + amount
        this.#progress = {
          __proto__: null,
          current: MathMax(0, Math.min(newCurrent, this.#progress.total)),
          total: this.#progress.total,
          ...(this.#progress.unit ? { unit: this.#progress.unit } : {}),
        } as ProgressInfo
        this.#updateSpinnerText()
      }
      return this
      /* c8 ignore stop */
    }

    /**
     * Start the spinner animation with optional text. Begins displaying the
     * animated spinner on stderr.
     *
     * @param text - Optional text to display with the spinner.
     *
     * @returns This spinner for chaining
     */
    start(...args: unknown[]) {
      /* c8 ignore start - args-length and normalized-falsy arms exercised across calls; some test paths skip both */
      if (args.length) {
        const text = ArrayPrototypeAt(args, 0)
        const normalized = normalizeText(text)
        if (!normalized) {
          this.#baseText = ''
          super['text'] = ''
        } else {
          this.#baseText = normalized
        }
      }
      /* c8 ignore stop */

      this.#updateSpinnerText()
      return this[applyStatusSymbol]('start', [])
    }

    /**
     * Stop the spinner animation and clear internal state. Auto-clears the
     * spinner line via yocto-spinner.stop(). Resets progress, shimmer, and text
     * state.
     *
     * @param text - Optional final text to display after stopping.
     *
     * @returns This spinner for chaining
     */
    stop(...args: unknown[]) {
      // Clear internal state.
      this.#baseText = ''
      this.#progress = undefined
      // Reset shimmer animation state.
      this.#shimmer = undefined

      // Call parent stop (clears screen, sets isSpinning = false).
      const result = this[applyStatusSymbol]('stop', args)

      return result
    }

    /**
     * Get or set the spinner text. When called with no arguments, returns the
     * current base text. When called with text, updates the display and returns
     * the spinner for chaining.
     *
     * @param value - Text to display (omit to get current text)
     *
     * @returns Current text (getter) or this spinner (setter)
     */
    text(): string
    text(value: string): SpinnerInstance
    text(value?: string | undefined): string | SpinnerInstance {
      // biome-ignore lint/complexity/noArguments: Function overload for getter/setter pattern.
      if (arguments.length === 0) {
        // Getter: return current base text
        return this.#baseText
      }
      // Setter: update base text and refresh display
      this.#baseText = value ?? ''
      this.#updateSpinnerText()
      return this as unknown as SpinnerInstance
    }
  } as unknown as SpinnerCtorType
  // Install the status-presentation methods (debug/done/fail/info/skip/step/
  // substep/success/warn families + log) onto the prototype. They reach the
  // class's #apply / #showStatusAndKeepSpinning helpers through the two
  // well-known symbols the class exposes.
  installStatusMethods(SpinnerCtor.prototype, logger)
  // Install the shimmer-configuration methods + shimmerState getter. They reach
  // the class's #shimmer / #shimmerSavedConfig state through well-known symbols.
  installShimmerMethods(SpinnerCtor.prototype)
  // Add aliases.
  ObjectDefineProperties(SpinnerCtor.prototype, {
    error: desc((SpinnerCtor.prototype as { fail: unknown }).fail),
    errorAndStop: desc(
      (SpinnerCtor.prototype as { failAndStop: unknown }).failAndStop,
    ),
    warning: desc((SpinnerCtor.prototype as { warn: unknown }).warn),
    warningAndStop: desc(
      (SpinnerCtor.prototype as { warnAndStop: unknown }).warnAndStop,
    ),
  })
  return SpinnerCtor
}
