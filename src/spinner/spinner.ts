/**
 * @fileoverview Spinner factory — builds the lazy-init `Spinner`
 * class that wraps `yocto-spinner` with Socket-specific behaviors
 * (custom RGB color pipeline, shimmer, progress bar, indented step
 * messages, status methods that don't auto-stop, *AndStop variants
 * that auto-clear). The class graph is constructed inside the
 * factory body so the `super()` call binds against the live
 * `YoctoSpinner` constructor; splitting it further would require
 * exposing the parent class as a module-level dependency, which
 * breaks the lazy-init guarantee.
 */

import type { ColorInherit, ColorRgb, ColorValue } from '../colors/types'
import { isRgbTuple, toRgb } from '../colors/convert'
import { getAbortSignal } from '../process/abort'
import { isDebug } from '../debug/namespace'
import type {
  Palette,
  ShimmerConfig,
  ShimmerDirection,
  ShimmerSpec,
} from '../effects/shimmer'
import { configToSpec, frameColors } from '../effects/shimmer'
import { colorsToAnsi } from '../effects/shimmer-terminal'
import { getCI } from '../env/ci'
import yoctoSpinner from '../external/@socketregistry/yocto-spinner'
import { getDefaultLogger } from '../logger/logger'
import {
  LOG_SYMBOLS,
  incLogCallCountSymbol,
  lastWasBlankSymbol,
} from '../logger/symbols'
import {
  ArrayIsArray,
  ArrayPrototypeAt,
  ArrayPrototypeSlice,
} from '../primordials/array'
import { TypeErrorCtor } from '../primordials/error'
import { MathMax } from '../primordials/math'
import { ObjectDefineProperties } from '../primordials/object'
import { isBlankString } from '../strings/predicates'
import { stringWidth } from '../strings/width'
import { getTheme } from '../themes/context'
import { THEMES } from '../themes/themes'
import { resolveColor } from '../themes/resolve'

import { getCliSpinners } from './registry'
import {
  COLOR_INHERIT,
  ciSpinner,
  desc,
  formatProgress,
  normalizeText,
} from './format'

import type {
  ProgressInfo,
  ShimmerInfo,
  SpinnerInstance,
  SpinnerOptions,
  SpinnerStyle,
  SymbolType,
} from './types'

let _Spinner: {
  new (options?: SpinnerOptions | undefined): SpinnerInstance
}
let _defaultSpinner: SpinnerStyle | undefined

/**
 * Create a spinner instance for displaying loading indicators.
 * Provides an animated CLI spinner with status messages, progress tracking, and shimmer effects.
 *
 * AUTO-CLEAR BEHAVIOR:
 * - All *AndStop() methods AUTO-CLEAR the spinner line via yocto-spinner.stop()
 *   Examples: `doneAndStop()`, `successAndStop()`, `failAndStop()`, etc.
 *
 * - Methods WITHOUT "AndStop" do NOT clear (spinner keeps spinning)
 *   Examples: `done()`, `success()`, `fail()`, etc.
 *
 * STREAM USAGE:
 * - Spinner animation: stderr (yocto-spinner default)
 * - Status methods (done, success, fail, info, warn, step, substep): stderr
 * - Data methods (`log()`): stdout
 *
 * COMPARISON WITH LOGGER:
 * - `logger.done()` does NOT auto-clear (requires manual `logger.clearLine()`)
 * - `spinner.doneAndStop()` DOES auto-clear (built into yocto-spinner.stop())
 * - Pattern: `logger.clearLine().done()` vs `spinner.doneAndStop()`
 *
 * @param options - Configuration options for the spinner
 * @returns New spinner instance
 *
 */
/*@__NO_SIDE_EFFECTS__*/
export function Spinner(options?: SpinnerOptions | undefined): SpinnerInstance {
  if (_Spinner === undefined) {
    /* c8 ignore start - External yoctoSpinner initialization */
    const YoctoCtor = yoctoSpinner as any
    // Get the actual YoctoSpinner class from an instance
    const tempInstance = YoctoCtor({})
    const YoctoSpinnerClass = tempInstance.constructor
    /* c8 ignore stop */
    const logger = getDefaultLogger()

    /*@__PURE__*/
    _Spinner = class SpinnerClass extends (YoctoSpinnerClass as any) {
      declare isSpinning: boolean
      #baseText: string = ''
      #indentation: string = ''
      #progress?: ProgressInfo | undefined
      #shimmer?: ShimmerInfo | undefined
      #shimmerSavedConfig?: ShimmerInfo | undefined

      constructor(options?: SpinnerOptions | undefined) {
        const opts = { __proto__: null, ...options } as SpinnerOptions

        // Get theme from options or current theme
        let theme = getTheme()
        if (opts.theme) {
          // Resolve theme name or use Theme object directly
          if (typeof opts.theme === 'string') {
            theme = THEMES[opts.theme] ?? theme
          } else {
            theme = opts.theme
          }
        }

        // Get default color from theme if not specified
        let defaultColor: ColorValue = theme.colors.primary
        if (theme.effects?.spinner?.color) {
          const resolved = resolveColor(
            theme.effects.spinner.color,
            theme.colors,
          )
          // resolveColor can return 'inherit' or gradients which aren't valid for spinner
          // Fall back to primary for these cases
          if (resolved === 'inherit' || ArrayIsArray(resolved[0])) {
            defaultColor = theme.colors.primary
          } else {
            defaultColor = resolved as ColorValue
          }
        }

        // Convert color option to RGB (default from theme).
        const spinnerColor = opts.color ?? defaultColor

        // Validate RGB tuple if provided.
        if (
          isRgbTuple(spinnerColor) &&
          (spinnerColor.length !== 3 ||
            !spinnerColor.every(
              n => typeof n === 'number' && n >= 0 && n <= 255,
            ))
        ) {
          throw new TypeErrorCtor(
            'RGB color must be an array of 3 numbers between 0 and 255',
          )
        }

        const spinnerColorRgb = toRgb(spinnerColor)

        // Parse shimmer config - can be object or direction string.
        let shimmerInfo: ShimmerInfo | undefined
        if (opts.shimmer) {
          let shimmerDir: ShimmerDirection
          let shimmerColor: ColorInherit | ColorValue | Palette
          // Default: 0.33 steps per frame (~150ms per step).
          let shimmerSpeed: number = 1 / 3

          if (typeof opts.shimmer === 'string') {
            shimmerDir = opts.shimmer
            shimmerColor = COLOR_INHERIT
          } else {
            const shimmerConfig = {
              __proto__: null,
              ...opts.shimmer,
            } as ShimmerConfig
            shimmerDir = shimmerConfig.dir ?? 'ltr'
            shimmerColor =
              (shimmerConfig.color as
                | ColorInherit
                | ColorValue
                | Palette
                | undefined) ?? COLOR_INHERIT
            shimmerSpeed = shimmerConfig.speed ?? 1 / 3
          }

          shimmerInfo = {
            __proto__: null,
            color: shimmerColor,
            direction: shimmerDir,
            speed: shimmerSpeed,
            frame: 0,
          } as ShimmerInfo
        }

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
       * Apply a yocto-spinner method and update logger state.
       * Handles text normalization, extra arguments, and logger tracking.
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
        // extras-empty no-op arm fires when log called without extras.
        /* c8 ignore start */
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
       * @private
       */
      #buildDisplayText() {
        let displayText = this.#baseText

        // Progress + shimmer paths fire only when caller seeded those
        // configs; tests exercise spinner without them.
        /* c8 ignore start */
        if (this.#progress) {
          const progressText = formatProgress(this.#progress)
          displayText = displayText
            ? `${displayText} ${progressText}`
            : progressText
        }

        if (displayText && this.#shimmer) {
          let shimmerColor: ColorRgb | Palette
          if (this.#shimmer.color === COLOR_INHERIT) {
            shimmerColor = this.color
          } else if (ArrayIsArray(this.#shimmer.color[0])) {
            shimmerColor = this.#shimmer.color as Palette
          } else {
            shimmerColor = toRgb(this.#shimmer.color as ColorValue)
          }

          if (!getCI() && this.#shimmer.direction !== 'none') {
            const chars = [...displayText]
            const spec: ShimmerSpec = configToSpec(
              {
                color: shimmerColor,
                dir: this.#shimmer.direction,
                speed: this.#shimmer.speed,
              },
              chars.length,
            )
            const colors = frameColors(spec, chars.length, this.#shimmer.frame)
            displayText = colorsToAnsi(displayText, colors)
            this.#shimmer.frame++
          }
        }

        // Indentation arm fires only when caller calls indent().
        if (this.#indentation && displayText) {
          displayText = this.#indentation + displayText
        }
        /* c8 ignore stop */

        return displayText
      }

      /**
       * Show a status message without stopping the spinner.
       * Outputs the symbol and message to stderr, then continues spinning.
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
       * Update the spinner's displayed text.
       * Rebuilds display text and triggers render.
       * @private
       */
      #updateSpinnerText() {
        // Call the parent class's text setter, which triggers render.
        super.text = this.#buildDisplayText()
      }

      /**
       * Show a debug message (ℹ) without stopping the spinner.
       * Only displays if debug mode is enabled via environment variable.
       * Outputs to stderr and continues spinning.
       *
       * @param text - Debug message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      debug(text?: string | undefined, ...extras: unknown[]) {
        if (isDebug()) {
          return this.#showStatusAndKeepSpinning('info', [text, ...extras])
        }
        return this
      }

      /**
       * Show a debug message (ℹ) and stop the spinner.
       * Only displays if debug mode is enabled via environment variable.
       * Auto-clears the spinner line before displaying the message.
       *
       * @param text - Debug message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      debugAndStop(text?: string | undefined, ...extras: unknown[]) {
        if (isDebug()) {
          return this.#apply('info', [text, ...extras])
        }
        return this
      }

      /**
       * Decrease indentation level by removing spaces from the left.
       * Pass 0 to reset indentation to zero completely.
       *
       * @param spaces - Number of spaces to remove
       * @returns This spinner for chaining
       * @default spaces=2
       *
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
       * Disable shimmer effect.
       * Preserves config for later re-enable via enableShimmer().
       *
       * @returns This spinner for chaining
       *
       * @example
       * spinner.disableShimmer()
       */
      disableShimmer(): SpinnerInstance {
        // Disable shimmer but preserve config.
        this.#shimmer = undefined
        this.#updateSpinnerText()
        return this as unknown as SpinnerInstance
      }

      /**
       * Show a done/success message (✓) without stopping the spinner.
       * Alias for `success()` with a shorter name.
       *
       * DESIGN DECISION: Unlike yocto-spinner, our `done()` does NOT stop the spinner.
       * Use `doneAndStop()` if you want to stop the spinner.
       *
       * @param text - Message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      done(text?: string | undefined, ...extras: unknown[]) {
        return this.#showStatusAndKeepSpinning('success', [text, ...extras])
      }

      /**
       * Show a done/success message (✓) and stop the spinner.
       * Auto-clears the spinner line before displaying the success message.
       *
       * @param text - Message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      doneAndStop(text?: string | undefined, ...extras: unknown[]) {
        return this.#apply('success', [text, ...extras])
      }

      /**
       * Enable shimmer effect.
       * Restores saved config or uses defaults if no saved config exists.
       *
       * @returns This spinner for chaining
       *
       * @example
       * spinner.enableShimmer()
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
       * Show a failure message (✗) without stopping the spinner.
       * DESIGN DECISION: Unlike yocto-spinner, our `fail()` does NOT stop the spinner.
       * This allows displaying errors while continuing to spin.
       * Use `failAndStop()` if you want to stop the spinner.
       *
       * @param text - Error message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      fail(text?: string | undefined, ...extras: unknown[]) {
        return this.#showStatusAndKeepSpinning('fail', [text, ...extras])
      }

      /**
       * Show a failure message (✗) and stop the spinner.
       * Auto-clears the spinner line before displaying the error message.
       *
       * @param text - Error message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      failAndStop(text?: string | undefined, ...extras: unknown[]) {
        return this.#apply('error', [text, ...extras])
      }

      /**
       * Increase indentation level by adding spaces to the left.
       * Pass 0 to reset indentation to zero completely.
       *
       * @param spaces - Number of spaces to add
       * @returns This spinner for chaining
       * @default spaces=2
       *
       */
      indent(spaces?: number | undefined) {
        // Pass 0 to reset indentation. spaces===0 fires when caller
        // explicitly passes 0; the else-branch + `?? 2` default fire
        // for omitted/non-zero arg.
        /* c8 ignore start */
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
       * Show an info message (ℹ) without stopping the spinner.
       * Outputs to stderr and continues spinning.
       *
       * @param text - Info message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      info(text?: string | undefined, ...extras: unknown[]) {
        return this.#showStatusAndKeepSpinning('info', [text, ...extras])
      }

      /**
       * Show an info message (ℹ) and stop the spinner.
       * Auto-clears the spinner line before displaying the message.
       *
       * @param text - Info message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      infoAndStop(text?: string | undefined, ...extras: unknown[]) {
        return this.#apply('info', [text, ...extras])
      }

      /**
       * Log a message to stdout without stopping the spinner.
       * Unlike other status methods, this outputs to stdout for data logging.
       *
       * @param args - Values to log to stdout
       * @returns This spinner for chaining
       */
      log(...args: unknown[]) {
        logger.log(...args)
        return this
      }

      /**
       * Log a message to stdout and stop the spinner.
       * Auto-clears the spinner line before displaying the message.
       *
       * @param text - Message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      logAndStop(text?: string | undefined, ...extras: unknown[]) {
        return this.#apply('stop', [text, ...extras])
      }

      /**
       * Update progress information displayed with the spinner.
       * Shows a progress bar with percentage and optional unit label.
       *
       * @param current - Current progress value
       * @param total - Total/maximum progress value
       * @param unit - Optional unit label (e.g., 'files', 'items')
       * @returns This spinner for chaining
       *
       */
      progress = (
        current: number,
        total: number,
        unit?: string | undefined,
      ) => {
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
       * Increment progress by a specified amount.
       * Updates the progress bar displayed with the spinner.
       * Clamps the result between 0 and the total value.
       *
       * @param amount - Amount to increment by
       * @returns This spinner for chaining
       * @default amount=1
       *
       */
      progressStep(amount: number = 1) {
        // No-progress no-op fires when called before progress() seed;
        // the unit-spread arm fires when progress was seeded with unit.
        /* c8 ignore start */
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
       * Show a skip message (↻) without stopping the spinner.
       * Outputs to stderr and continues spinning.
       *
       * @param text - Skip message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      skip(text?: string | undefined, ...extras: unknown[]) {
        return this.#showStatusAndKeepSpinning('skip', [text, ...extras])
      }

      /**
       * Show a skip message (↻) and stop the spinner.
       * Auto-clears the spinner line before displaying the message.
       *
       * Implementation note: Unlike other *AndStop methods (successAndStop, failAndStop, etc.),
       * this method cannot use #apply() with a 'skip' method name because yocto-spinner doesn't
       * have a built-in 'skip' method. Instead, we manually stop the spinner then log the message
       * with the skip symbol.
       *
       * @param text - Skip message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      skipAndStop(text?: string | undefined, ...extras: unknown[]) {
        this.#apply('stop', [])
        const normalized = normalizeText(text)
        // Empty-text no-op fires when text is undefined or whitespace-only.
        /* c8 ignore start */
        if (normalized) {
          logger.error(`${LOG_SYMBOLS['skip']} ${normalized}`, ...extras)
        }
        return this
        /* c8 ignore stop */
      }

      /**
       * Set complete shimmer configuration.
       * Replaces any existing shimmer config with the provided values.
       * Undefined properties will use default values.
       *
       * @param config - Complete shimmer configuration
       * @returns This spinner for chaining
       *
       * @example
       * spinner.setShimmer({
       *   color: [255, 0, 0],
       *   dir: 'rtl',
       *   speed: 0.5
       * })
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
       * Start the spinner animation with optional text.
       * Begins displaying the animated spinner on stderr.
       *
       * @param text - Optional text to display with the spinner
       * @returns This spinner for chaining
       *
       */
      start(...args: unknown[]) {
        // args-length and normalized-falsy arms exercised across calls;
        // some test paths skip both arms.
        /* c8 ignore start */
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
       * Log a main step message to stderr without stopping the spinner.
       * Adds a blank line before the message for visual separation.
       * Aligns with `logger.step()` to use stderr for status messages.
       *
       * @param text - Step message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       *
       */
      step(text?: string | undefined, ...extras: unknown[]) {
        // text-omitted no-op arm fires when caller invokes step() bare.
        /* c8 ignore start */
        if (typeof text === 'string') {
          logger.error('')
          logger.error(text, ...extras)
        }
        return this
        /* c8 ignore stop */
      }

      /**
       * Stop the spinner animation and clear internal state.
       * Auto-clears the spinner line via yocto-spinner.stop().
       * Resets progress, shimmer, and text state.
       *
       * @param text - Optional final text to display after stopping
       * @returns This spinner for chaining
       *
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
       * Adds 2-space indentation to the message.
       * Aligns with `logger.substep()` to use stderr for status messages.
       *
       * @param text - Substep message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       *
       */
      substep(text?: string | undefined, ...extras: unknown[]) {
        // text-omitted no-op arm fires when caller invokes substep() bare.
        /* c8 ignore start */
        if (typeof text === 'string') {
          logger.error(`  ${text}`, ...extras)
        }
        return this
        /* c8 ignore stop */
      }

      /**
       * Show a success message (✓) without stopping the spinner.
       * DESIGN DECISION: Unlike yocto-spinner, our `success()` does NOT stop the spinner.
       * This allows displaying success messages while continuing to spin for multi-step operations.
       * Use `successAndStop()` if you want to stop the spinner.
       *
       * @param text - Success message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      success(text?: string | undefined, ...extras: unknown[]) {
        return this.#showStatusAndKeepSpinning('success', [text, ...extras])
      }

      /**
       * Show a success message (✓) and stop the spinner.
       * Auto-clears the spinner line before displaying the success message.
       *
       * @param text - Success message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      successAndStop(text?: string | undefined, ...extras: unknown[]) {
        return this.#apply('success', [text, ...extras])
      }

      /**
       * Get or set the spinner text.
       * When called with no arguments, returns the current base text.
       * When called with text, updates the display and returns the spinner for chaining.
       *
       * @param value - Text to display (omit to get current text)
       * @returns Current text (getter) or this spinner (setter)
       *
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
       * Update partial shimmer configuration.
       * Merges with existing config, enabling shimmer if currently disabled.
       *
       * @param config - Partial shimmer configuration to merge
       * @returns This spinner for chaining
       *
       * @example
       * // Update just the speed
       * spinner.updateShimmer({ speed: 0.5 })
       *
       * // Update direction
       * spinner.updateShimmer({ dir: 'rtl' })
       *
       * // Update multiple properties
       * spinner.updateShimmer({ color: [255, 0, 0], speed: 0.8 })
       */
      updateShimmer(config: Partial<ShimmerConfig>): SpinnerInstance {
        // Each partial-config field branch fires only when caller
        // updates that specific field; tests don't pair all sub-arms
        // in a single call. The shimmer-state cascade (existing /
        // savedConfig / fresh) covers three init paths.
        /* c8 ignore start */
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
       * Show a warning message (⚠) without stopping the spinner.
       * Outputs to stderr and continues spinning.
       *
       * @param text - Warning message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      warn(text?: string | undefined, ...extras: unknown[]) {
        return this.#showStatusAndKeepSpinning('warn', [text, ...extras])
      }

      /**
       * Show a warning message (⚠) and stop the spinner.
       * Auto-clears the spinner line before displaying the warning message.
       *
       * @param text - Warning message to display
       * @param extras - Additional values to log
       * @returns This spinner for chaining
       */
      warnAndStop(text?: string | undefined, ...extras: unknown[]) {
        return this.#apply('warning', [text, ...extras])
      }
    } as unknown as {
      new (options?: SpinnerOptions | undefined): SpinnerInstance
    }
    // Add aliases.
    ObjectDefineProperties(_Spinner.prototype, {
      error: desc(_Spinner.prototype.fail),
      errorAndStop: desc(_Spinner.prototype.failAndStop),
      warning: desc(_Spinner.prototype.warn),
      warningAndStop: desc(_Spinner.prototype.warnAndStop),
    })
    // CI vs interactive spinner; getCI() returns false in test runs.
    /* c8 ignore start */
    _defaultSpinner = getCI()
      ? ciSpinner
      : (getCliSpinners('socket') as SpinnerStyle)
    /* c8 ignore stop */
  }
  return new _Spinner({
    spinner: _defaultSpinner,
    ...options,
  })
}
