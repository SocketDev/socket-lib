/**
 * @file Builds the lazy-init Socket `Spinner` class that extends the live
 *   `yocto-spinner` constructor. The class graph is constructed inside
 *   `createSpinnerClass()` so the `super()` call binds against the runtime
 *   `YoctoSpinner` constructor passed in by the factory; keeping it here (rather
 *   than at module scope) preserves the spinner's lazy-init guarantee while
 *   splitting the bulk of the class body out of the factory module.
 */

import type { ColorInherit, ColorRgb, ColorValue } from '../colors/types'
import { isRgbTuple, toRgb } from '../colors/convert'
import { getAbortSignal } from '../process/abort'
import { isDebug } from '../debug/namespace'
import type { Palette, ShimmerConfig } from '../effects/shimmer'
import {
  LOG_SYMBOLS,
  incLogCallCountSymbol,
  lastWasBlankSymbol,
} from '../logger/symbols'
import {
  ArrayPrototypeAt,
  ArrayPrototypeSlice,
} from '../primordials/array'
import { MathMax } from '../primordials/math'
import { ObjectDefineProperties } from '../primordials/object'
import { isBlankString } from '../strings/predicates'
import { stringWidth } from '../strings/width'

import { COLOR_INHERIT, desc, formatProgress, normalizeText } from './format'
import {
  applyShimmer,
  parseShimmerOption,
  resolveSpinnerColorRgb,
} from './spinner-internals'

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
  color: ColorRgb | ColorValue
  text: string
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

      // eslint-disable-next-line constructor-super
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
                super.text = this.#buildDisplayText()
              }
            }
          : undefined,
      })

      this.#shimmer = shimmerInfo
      this.#shimmerSavedConfig = shimmerInfo
    }

    // Override color getter to ensure it's always RGB.
    get color(): ColorRgb {
      const value = super.color
      return isRgbTuple(value) ? value : toRgb(value)
    }

    // Override color setter to always convert to RGB before passing to yocto-spinner.
    set color(value: ColorValue | ColorRgb) {
      super.color = isRgbTuple(value) ? value : toRgb(value)
    }

    // Getter to expose current shimmer state.
    get shimmerState(): ShimmerInfo | undefined {
      if (!this.#shimmer) {
        return undefined
      }
      return {
        __proto__: null,
        color: this.#shimmer.color,
        direction: this.#shimmer.direction,
        speed: this.#shimmer.speed,
        frame: this.#shimmer.frame,
      } as ShimmerInfo
    }

    /**
     * Apply a yocto-spinner method and update logger state. Handles text
     * normalization, extra arguments, and logger tracking.
     *
     * @private
     */
    #apply(methodName: string, args: unknown[]) {
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
      if (methodName === 'stop' && !normalized) {
        super[methodName]()
      } else {
        super[methodName](normalized)
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
     * Build the complete display text with progress, shimmer, and
     * indentation. Combines base text, progress bar, shimmer effects, and
     * indentation.
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
     * and message to stderr, then continues spinning.
     *
     * @private
     */
    #showStatusAndKeepSpinning(symbolType: SymbolType, args: unknown[]) {
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
      super.text = this.#buildDisplayText()
    }

    // Show a debug message (ℹ) without stopping; only when debug mode is on.
    debug(text?: string | undefined, ...extras: unknown[]) {
      if (isDebug()) {
        return this.#showStatusAndKeepSpinning('info', [text, ...extras])
      }
      return this
    }

    // Show a debug message (ℹ) and stop; only when debug mode is on.
    debugAndStop(text?: string | undefined, ...extras: unknown[]) {
      if (isDebug()) {
        return this.#apply('info', [text, ...extras])
      }
      return this
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
     * Disable shimmer effect. Preserves config for later re-enable via
     * enableShimmer().
     *
     * @example
     *   spinner.disableShimmer()
     *
     * @returns This spinner for chaining
     */
    disableShimmer(): SpinnerInstance {
      // Disable shimmer but preserve config.
      this.#shimmer = undefined
      this.#updateSpinnerText()
      return this as unknown as SpinnerInstance
    }

    /**
     * Show a done/success message (✓) without stopping the spinner. Alias for
     * `success()` with a shorter name.
     *
     * DESIGN DECISION: Unlike yocto-spinner, our `done()` does NOT stop the
     * spinner. Use `doneAndStop()` if you want to stop the spinner.
     *
     * @param text - Message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    done(text?: string | undefined, ...extras: unknown[]) {
      return this.#showStatusAndKeepSpinning('success', [text, ...extras])
    }

    /**
     * Show a done/success message (✓) and stop the spinner. Auto-clears the
     * spinner line before displaying the success message.
     *
     * @param text - Message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    doneAndStop(text?: string | undefined, ...extras: unknown[]) {
      return this.#apply('success', [text, ...extras])
    }

    /**
     * Enable shimmer effect. Restores saved config or uses defaults if no
     * saved config exists.
     *
     * @example
     *   spinner.enableShimmer()
     *
     * @returns This spinner for chaining
     */
    enableShimmer(): SpinnerInstance {
      if (this.#shimmerSavedConfig) {
        // Restore saved config (reset frame counter to 0).
        this.#shimmer = { ...this.#shimmerSavedConfig, frame: 0 }
      } else {
        this.#shimmer = {
          __proto__: null,
          color: COLOR_INHERIT,
          direction: 'ltr',
          speed: 1 / 3,
          frame: 0,
        } as ShimmerInfo
        this.#shimmerSavedConfig = this.#shimmer
      }

      this.#updateSpinnerText()
      return this as unknown as SpinnerInstance
    }

    /**
     * Show a failure message (✗) without stopping the spinner. DESIGN
     * DECISION: Unlike yocto-spinner, our `fail()` does NOT stop the spinner.
     * This allows displaying errors while continuing to spin. Use
     * `failAndStop()` if you want to stop the spinner.
     *
     * @param text - Error message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    fail(text?: string | undefined, ...extras: unknown[]) {
      return this.#showStatusAndKeepSpinning('fail', [text, ...extras])
    }

    /**
     * Show a failure message (✗) and stop the spinner. Auto-clears the
     * spinner line before displaying the error message.
     *
     * @param text - Error message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    failAndStop(text?: string | undefined, ...extras: unknown[]) {
      return this.#apply('error', [text, ...extras])
    }

    /**
     * Increase indentation level by adding spaces to the left. Pass 0 to
     * reset indentation to zero completely.
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
     * Show an info message (ℹ) without stopping the spinner. Outputs to
     * stderr and continues spinning.
     *
     * @param text - Info message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    info(text?: string | undefined, ...extras: unknown[]) {
      return this.#showStatusAndKeepSpinning('info', [text, ...extras])
    }

    /**
     * Show an info message (ℹ) and stop the spinner. Auto-clears the spinner
     * line before displaying the message.
     *
     * @param text - Info message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    infoAndStop(text?: string | undefined, ...extras: unknown[]) {
      return this.#apply('info', [text, ...extras])
    }

    /**
     * Log a message to stdout without stopping the spinner. Unlike other
     * status methods, this outputs to stdout for data logging.
     *
     * @param args - Values to log to stdout.
     *
     * @returns This spinner for chaining
     */
    log(...args: unknown[]) {
      logger.log(...args)
      return this
    }

    /**
     * Log a message to stdout and stop the spinner. Auto-clears the spinner
     * line before displaying the message.
     *
     * @param text - Message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    logAndStop(text?: string | undefined, ...extras: unknown[]) {
      return this.#apply('stop', [text, ...extras])
    }

    /**
     * Update progress information displayed with the spinner. Shows a
     * progress bar with percentage and optional unit label.
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
     * Show a skip message (↻) without stopping the spinner. Outputs to stderr
     * and continues spinning.
     *
     * @param text - Skip message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    skip(text?: string | undefined, ...extras: unknown[]) {
      return this.#showStatusAndKeepSpinning('skip', [text, ...extras])
    }

    /**
     * Show a skip message (↻) and stop the spinner. Auto-clears the spinner
     * line before displaying the message.
     *
     * Implementation note: Unlike other *AndStop methods (successAndStop,
     * failAndStop, etc.), this method cannot use #apply() with a 'skip'
     * method name because yocto-spinner doesn't have a built-in 'skip'
     * method. Instead, we manually stop the spinner then log the message with
     * the skip symbol.
     *
     * @param text - Skip message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    skipAndStop(text?: string | undefined, ...extras: unknown[]) {
      this.#apply('stop', [])
      const normalized = normalizeText(text)
      /* c8 ignore start - empty-text no-op fires when text is undefined or whitespace-only */
      if (normalized) {
        logger.error(`${LOG_SYMBOLS['skip']} ${normalized}`, ...extras)
      }
      return this
      /* c8 ignore stop */
    }

    /**
     * Set complete shimmer configuration. Replaces any existing shimmer
     * config with the provided values. Undefined properties will use default
     * values.
     *
     * @example
     *   spinner.setShimmer({
     *     color: [255, 0, 0],
     *     dir: 'rtl',
     *     speed: 0.5,
     *   })
     *
     * @param config - Complete shimmer configuration.
     *
     * @returns This spinner for chaining
     */
    setShimmer(config: ShimmerConfig): SpinnerInstance {
      this.#shimmer = {
        __proto__: null,
        color:
          (config.color as ColorInherit | ColorValue | Palette | undefined) ??
          COLOR_INHERIT,
        direction: config.dir ?? 'ltr',
        speed: config.speed ?? 1 / 3,
        frame: 0,
      } as ShimmerInfo
      this.#shimmerSavedConfig = this.#shimmer
      this.#updateSpinnerText()
      return this as unknown as SpinnerInstance
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
          super.text = ''
        } else {
          this.#baseText = normalized
        }
      }
      /* c8 ignore stop */

      this.#updateSpinnerText()
      return this.#apply('start', [])
    }

    /**
     * Log a main step message to stderr without stopping the spinner. Adds a
     * blank line before the message for visual separation. Aligns with
     * `logger.step()` to use stderr for status messages.
     *
     * @param text - Step message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    step(text?: string | undefined, ...extras: unknown[]) {
      /* c8 ignore start - text-omitted no-op arm fires when caller invokes step() bare */
      if (typeof text === 'string') {
        logger.error('')
        logger.error(text, ...extras)
      }
      return this
      /* c8 ignore stop */
    }

    /**
     * Stop the spinner animation and clear internal state. Auto-clears the
     * spinner line via yocto-spinner.stop(). Resets progress, shimmer, and
     * text state.
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
      const result = this.#apply('stop', args)

      return result
    }

    /**
     * Log an indented substep message to stderr without stopping the spinner.
     * Adds 2-space indentation to the message. Aligns with `logger.substep()`
     * to use stderr for status messages.
     *
     * @param text - Substep message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    substep(text?: string | undefined, ...extras: unknown[]) {
      /* c8 ignore start - text-omitted no-op arm fires when caller invokes substep() bare */
      if (typeof text === 'string') {
        logger.error(`  ${text}`, ...extras)
      }
      return this
      /* c8 ignore stop */
    }

    /**
     * Show a success message (✓) without stopping the spinner. DESIGN
     * DECISION: Unlike yocto-spinner, our `success()` does NOT stop the
     * spinner. This allows displaying success messages while continuing to
     * spin for multi-step operations. Use `successAndStop()` if you want to
     * stop the spinner.
     *
     * @param text - Success message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    success(text?: string | undefined, ...extras: unknown[]) {
      return this.#showStatusAndKeepSpinning('success', [text, ...extras])
    }

    /**
     * Show a success message (✓) and stop the spinner. Auto-clears the
     * spinner line before displaying the success message.
     *
     * @param text - Success message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    successAndStop(text?: string | undefined, ...extras: unknown[]) {
      return this.#apply('success', [text, ...extras])
    }

    /**
     * Get or set the spinner text. When called with no arguments, returns the
     * current base text. When called with text, updates the display and
     * returns the spinner for chaining.
     *
     * @param value - Text to display (omit to get current text)
     *
     * @returns Current text (getter) or this spinner (setter)
     */
    text(): string
    text(value: string): SpinnerInstance
    text(value?: string): string | SpinnerInstance {
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

    /**
     * Update partial shimmer configuration. Merges with existing config,
     * enabling shimmer if currently disabled.
     *
     * @example
     *   // Update just the speed
     *   spinner.updateShimmer({ speed: 0.5 })
     *
     *   // Update direction
     *   spinner.updateShimmer({ dir: 'rtl' })
     *
     *   // Update multiple properties
     *   spinner.updateShimmer({ color: [255, 0, 0], speed: 0.8 })
     *
     * @param config - Partial shimmer configuration to merge.
     *
     * @returns This spinner for chaining
     */
    updateShimmer(config: Partial<ShimmerConfig>): SpinnerInstance {
      /* c8 ignore start - each partial-config field branch fires only when caller updates that field; shimmer-state cascade covers three init paths */
      const partialConfig = {
        __proto__: null,
        ...config,
      } as Partial<ShimmerConfig>

      const update: Partial<ShimmerInfo> = {
        __proto__: null,
      } as Partial<ShimmerInfo>
      if (partialConfig.color !== undefined) {
        update.color = partialConfig.color as
          | ColorInherit
          | ColorValue
          | Palette
      }
      if (partialConfig.dir !== undefined) {
        update.direction = partialConfig.dir
      }
      if (partialConfig.speed !== undefined) {
        update.speed = partialConfig.speed
      }

      if (this.#shimmer) {
        this.#shimmer = { ...this.#shimmer, ...update } as ShimmerInfo
      } else if (this.#shimmerSavedConfig) {
        this.#shimmer = {
          ...this.#shimmerSavedConfig,
          ...update,
          frame: 0,
        } as ShimmerInfo
      } else {
        this.#shimmer = {
          __proto__: null,
          color: COLOR_INHERIT,
          direction: 'ltr',
          speed: 1 / 3,
          frame: 0,
          ...update,
        } as ShimmerInfo
      }
      this.#shimmerSavedConfig = this.#shimmer

      this.#updateSpinnerText()
      return this as unknown as SpinnerInstance
      /* c8 ignore stop */
    }

    /**
     * Show a warning message (⚠) without stopping the spinner. Outputs to
     * stderr and continues spinning.
     *
     * @param text - Warning message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    warn(text?: string | undefined, ...extras: unknown[]) {
      return this.#showStatusAndKeepSpinning('warn', [text, ...extras])
    }

    /**
     * Show a warning message (⚠) and stop the spinner. Auto-clears the
     * spinner line before displaying the warning message.
     *
     * @param text - Warning message to display.
     * @param extras - Additional values to log.
     *
     * @returns This spinner for chaining
     */
    warnAndStop(text?: string | undefined, ...extras: unknown[]) {
      return this.#apply('warning', [text, ...extras])
    }
  } as unknown as SpinnerCtorType
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
