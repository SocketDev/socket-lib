/**
 * @fileoverview Public type surface for `spinner/*` modules — the
 * `Spinner` instance shape, configuration option records, progress and
 * shimmer state types, plus the `withSpinner*` option records. Pure
 * types only; no runtime side effects so this module stays cheap to
 * import everywhere.
 */

import type { Writable } from 'node:stream'

import type { ColorInherit, ColorRgb, ColorValue } from '../colors/types'
import type {
  Palette,
  ShimmerConfig,
  ShimmerDirection,
} from '../effects/shimmer'

/**
 * Progress tracking information for display in spinner.
 * Used by `progress()` and `progressStep()` methods to show animated progress bars.
 */
export type ProgressInfo = {
  /** Current progress value */
  current: number
  /** Total/maximum progress value */
  total: number
  /** Optional unit label displayed after the progress count (e.g., 'files', 'items') */
  unit?: string | undefined
}

/**
 * Internal shimmer runtime state. Holds the user-facing config plus a
 * monotonic frame counter; the spinner advances `frame` on each animation
 * tick and feeds the current frame to the shimmer engine.
 */
export type ShimmerInfo = {
  /** User-facing color reference (inherit, explicit value, or palette). */
  color: ColorInherit | ColorValue | Palette
  /** Current direction (driven by config, snapshotted here for getters). */
  direction: ShimmerDirection
  /** Steps per frame. */
  speed: number
  /** Monotonic frame counter — advanced on each animation tick. */
  frame: number
}

/**
 * Spinner instance for displaying animated loading indicators.
 * Provides methods for status updates, progress tracking, and text shimmer effects.
 *
 * KEY BEHAVIORS:
 * - Methods WITHOUT "AndStop" keep the spinner running (e.g., `success()`, `fail()`)
 * - Methods WITH "AndStop" auto-clear the spinner line (e.g., `successAndStop()`, `failAndStop()`)
 * - Status messages (done, success, fail, info, warn, reason, step, substep) go to stderr
 * - Data messages (`log()`) go to stdout
 *
 * @example
 * ```ts
 * import { Spinner } from '@socketsecurity/lib/spinner/spinner'
 *
 * const spinner = Spinner({ text: 'Loading…' })
 * spinner.start()
 *
 * // Show success while continuing to spin
 * spinner.success('Step 1 complete')
 *
 * // Stop the spinner with success message
 * spinner.successAndStop('All done!')
 * ```
 */
export type Spinner = {
  /** Current spinner color as RGB tuple */
  color: ColorRgb
  /** Current spinner animation style */
  spinner: SpinnerStyle

  /** Whether spinner is currently animating */
  get isSpinning(): boolean

  /** Get current shimmer state (enabled/disabled and configuration) */
  get shimmerState(): ShimmerInfo | undefined

  /** Clear the current line without stopping the spinner */
  clear(): Spinner

  /** Show debug message without stopping (only if debug mode enabled) */
  debug(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Show debug message and stop the spinner (only if debug mode enabled) */
  debugAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Decrease indentation by specified spaces (default: 2) */
  dedent(spaces?: number | undefined): Spinner

  /** Disable shimmer effect (preserves config for later re-enable) */
  disableShimmer(): Spinner

  /** Alias for `success()` - show success without stopping */
  done(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Alias for `successAndStop()` - show success and stop */
  doneAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Enable shimmer effect (restores saved config or uses defaults) */
  enableShimmer(): Spinner

  /** Alias for `fail()` - show error without stopping */
  error(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Alias for `failAndStop()` - show error and stop */
  errorAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Show failure (✗) without stopping the spinner */
  fail(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Show failure (✗) and stop the spinner, auto-clearing the line */
  failAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Increase indentation by specified spaces (default: 2) */
  indent(spaces?: number | undefined): Spinner

  /** Show info (ℹ) message without stopping the spinner */
  info(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Show info (ℹ) message and stop the spinner, auto-clearing the line */
  infoAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Log to stdout without stopping the spinner */
  log(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Log and stop the spinner, auto-clearing the line */
  logAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Update progress bar with current/total values and optional unit */
  progress(current: number, total: number, unit?: string | undefined): Spinner
  /** Increment progress by specified amount (default: 1) */
  progressStep(amount?: number): Spinner

  /** Set complete shimmer configuration */
  setShimmer(config: ShimmerConfig): Spinner

  /** Show skip (↻) message without stopping the spinner */
  skip(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Show skip (↻) message and stop the spinner, auto-clearing the line */
  skipAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Start spinning with optional text */
  start(text?: string | undefined): Spinner

  /** Show main step message to stderr without stopping */
  step(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Stop spinning and clear internal state, auto-clearing the line */
  stop(text?: string | undefined): Spinner
  /** Stop and show final text without clearing the line */
  stopAndPersist(text?: string | undefined): Spinner

  /** Show indented substep message to stderr without stopping */
  substep(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Show success (✓) without stopping the spinner */
  success(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Show success (✓) and stop the spinner, auto-clearing the line */
  successAndStop(text?: string | undefined, ...extras: unknown[]): Spinner

  /** Get current spinner text (getter) or set new text (setter) */
  text(value: string): Spinner
  text(): string

  /** Update partial shimmer configuration */
  updateShimmer(config: Partial<ShimmerConfig>): Spinner

  /** Show warning (⚠) without stopping the spinner */
  warn(text?: string | undefined, ...extras: unknown[]): Spinner
  /** Show warning (⚠) and stop the spinner, auto-clearing the line */
  warnAndStop(text?: string | undefined, ...extras: unknown[]): Spinner
}

/**
 * Configuration options for creating a spinner instance.
 */
export type SpinnerOptions = {
  /**
   * Spinner color as RGB tuple or color name.
   * @default [140, 82, 255] Socket purple
   */
  readonly color?: ColorValue | undefined
  /**
   * Shimmer effect configuration or direction string.
   * When enabled, text will have an animated shimmer effect.
   * @default undefined No shimmer effect
   */
  readonly shimmer?: ShimmerConfig | ShimmerDirection | undefined
  /**
   * Animation style with frames and timing.
   * @default 'socket' Custom Socket animation in CLI, minimal in CI
   */
  readonly spinner?: SpinnerStyle | undefined
  /**
   * Abort signal for cancelling the spinner.
   * @default getAbortSignal() from process constants
   */
  readonly signal?: AbortSignal | undefined
  /**
   * Output stream for spinner rendering.
   * @default process.stderr
   */
  readonly stream?: Writable | undefined
  /**
   * Initial text to display with the spinner.
   * @default undefined No initial text
   */
  readonly text?: string | undefined
  /**
   * Theme to use for spinner colors.
   * Accepts theme name ('socket', 'sunset', etc.) or Theme object.
   * @default Current theme from getTheme()
   */
  readonly theme?:
    | import('../themes/types').Theme
    | import('../themes/themes').ThemeName
    | undefined
}

/**
 * Animation style definition for spinner frames.
 * Defines the visual appearance and timing of the spinner animation.
 */
export type SpinnerStyle = {
  /** Array of animation frames (strings to display sequentially) */
  readonly frames: string[]
  /**
   * Milliseconds between frame changes.
   * @default 80 Standard frame rate
   */
  readonly interval?: number | undefined
}

/**
 * Symbol types for status messages.
 * Maps to log symbols: fail (✗), info (ℹ), skip (↻), success (✓), warn (⚠).
 */
export type SymbolType = 'fail' | 'info' | 'skip' | 'success' | 'warn'

/**
 * Configuration options for `withSpinner()` helper.
 * @template T - Return type of the async operation
 */
export type WithSpinnerOptions<T> = {
  /** Message to display while the spinner is running */
  message: string
  /** Async function to execute while spinner is active */
  operation: () => Promise<T>
  /**
   * Optional spinner instance to use.
   * If not provided, operation runs without spinner.
   */
  spinner?: Spinner | undefined
  /**
   * Optional spinner options to apply during the operation.
   * These options will be pushed when the operation starts and popped when it completes.
   * Supports color and shimmer configuration.
   */
  withOptions?: Partial<Pick<SpinnerOptions, 'color' | 'shimmer'>> | undefined
}

/**
 * Configuration options for `withSpinnerRestore()` helper.
 * @template T - Return type of the async operation
 */
export type WithSpinnerRestoreOptions<T> = {
  /** Async function to execute while spinner is stopped */
  operation: () => Promise<T>
  /** Optional spinner instance to restore after operation */
  spinner?: Spinner | undefined
  /** Whether spinner was spinning before the operation (used to conditionally restart) */
  wasSpinning: boolean
}

/**
 * Configuration options for `withSpinnerSync()` helper.
 * @template T - Return type of the sync operation
 */
export type WithSpinnerSyncOptions<T> = {
  /** Message to display while the spinner is running */
  message: string
  /** Synchronous function to execute while spinner is active */
  operation: () => T
  /**
   * Optional spinner instance to use.
   * If not provided, operation runs without spinner.
   */
  spinner?: Spinner | undefined
  /**
   * Optional spinner options to apply during the operation.
   * These options will be pushed when the operation starts and popped when it completes.
   * Supports color and shimmer configuration.
   */
  withOptions?: Partial<Pick<SpinnerOptions, 'color' | 'shimmer'>> | undefined
}
