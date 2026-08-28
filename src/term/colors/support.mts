/**
 * @file Color-capability detection for `term/colors/*` and `logger/*`. Answers
 *   "may I emit an escape to this stream, and how wide a palette", keyed on the
 *   stream being written to rather than on a process-global guess.
 *   Two streams can disagree: a run with stdout piped to a file and stderr on
 *   the terminal supports color on one and not the other, so every helper here
 *   takes the target stream. The underlying detector resolves `NO_COLOR`,
 *   `FORCE_COLOR`, the `--color` / `--no-color` argv flags, CI, `TERM`,
 *   `COLORTERM`, and `TERM_PROGRAM`.
 *   The detector lives in the external-pack mega-bundle, whose module top-level
 *   evaluates every packed package, so it is required lazily on first call —
 *   the same rule `logger/colors.mts` follows, keeping these importers
 *   browser-load-safe and cheap at module init.
 */

import type { ColorInfo, Options } from '../../external/supports-color.js'

let cachedSupportsColor: SupportsColorModule | undefined

/**
 * Palette width a stream accepts, widest capability last.
 *
 * `none` emits no escape at all. `basic` is the 16-color set, `ansi256` the
 * 256-color palette, and `truecolor` the 24-bit `[38;2;r;g;bm` form.
 */
export type ColorPalette = 'none' | 'basic' | 'ansi256' | 'truecolor'

/**
 * Minimal stream shape the detector reads. Structural rather than
 * `tty.WriteStream` so a captured stream, a PTY, or a test double all satisfy
 * it, because the detector only ever reads `isTTY`.
 */
export interface ColorStreamLike {
  isTTY?: boolean | undefined
}

/**
 * The detector module as `require` returns it. The package's DEFAULT export is
 * the eager `{ stdout, stderr }` pair, and `createSupportsColor` is a sibling
 * NAMED export, so neither alone describes what `require` hands back.
 */
export interface SupportsColorModule {
  createSupportsColor: (
    stream?: ColorStreamLike | undefined,
    options?: Options | undefined,
  ) => ColorInfo
  stdout: ColorInfo
  stderr: ColorInfo
}

/**
 * What a stream accepts, resolved from the stream plus the environment.
 */
export interface ColorCapability {
  /**
   * Widest palette the stream accepts.
   */
  palette: ColorPalette
  /**
   * Numeric level, 0 none through 3 truecolor. Mirrors `palette` for callers
   * that would rather compare ordinals than strings.
   */
  level: 0 | 1 | 2 | 3
  /**
   * Whether the 16-color set is accepted.
   */
  hasBasic: boolean
  /**
   * Whether the 256-color palette is accepted.
   */
  has256: boolean
  /**
   * Whether 24-bit truecolor is accepted.
   */
  has16m: boolean
}

/**
 * Capability of a stream that accepts no escapes at all.
 */
export const COLOR_CAPABILITY_NONE: ColorCapability = Object.freeze({
  palette: 'none',
  level: 0,
  hasBasic: false,
  has256: false,
  has16m: false,
}) as ColorCapability

/**
 * Resolve what a stream accepts.
 *
 * Pass the stream the text is going to. Omitting it resolves nothing and
 * returns {@link COLOR_CAPABILITY_NONE}, because "no stream named" cannot be
 * answered as "color is fine".
 *
 * @example
 *   ;```typescript
 *   getColorCapability({ stream: process.stderr }).has16m
 *   ```
 *
 * @param config - Resolution inputs.
 *
 * @returns What the stream accepts.
 */
export function getColorCapability(
  config?: ColorCapabilityConfig | undefined,
): ColorCapability {
  const { sniffFlags, stream } = {
    __proto__: null,
    ...config,
  } as ColorCapabilityConfig
  if (!stream) {
    return COLOR_CAPABILITY_NONE
  }
  const options: Options | undefined =
    sniffFlags === undefined ? undefined : { sniffFlags }
  const info = getSupportsColor().createSupportsColor(stream, options)
  return toColorCapability(info)
}

/**
 * Inputs every capability helper takes.
 */
export interface ColorCapabilityConfig {
  /**
   * Stream the text is written to. Capability is a property of the destination,
   * so there is no process-wide answer to fall back on.
   */
  stream?: ColorStreamLike | undefined
  /**
   * Whether to honor `--color` / `--no-color` in `process.argv`. Defaults to
   * `true`, matching the detector.
   */
  sniffFlags?: boolean | undefined
}

/**
 * Get the color detector. Required lazily on first call — see the @file note on
 * the external-pack top-level.
 *
 * @returns The detector module.
 */
export function getSupportsColor(): SupportsColorModule {
  if (cachedSupportsColor === undefined) {
    cachedSupportsColor =
      require('../../external/supports-color') as SupportsColorModule
  }
  return cachedSupportsColor
}

/**
 * Whether a stream accepts any color escape at all.
 *
 * The cheap gate to put in front of an escape-emitting write.
 *
 * @param config - Resolution inputs.
 *
 * @returns `true` when the stream accepts at least the 16-color set.
 */
export function isColorSupported(
  config?: ColorCapabilityConfig | undefined,
): boolean {
  return getColorCapability(config).hasBasic
}

/**
 * Whether a stream accepts 24-bit truecolor.
 *
 * The gate for an RGB tuple, which has no meaning on a 16-color stream.
 *
 * @param config - Resolution inputs.
 *
 * @returns `true` when the stream accepts `[38;2;r;g;bm`.
 */
export function isTrueColorSupported(
  config?: ColorCapabilityConfig | undefined,
): boolean {
  return getColorCapability(config).has16m
}

/**
 * Convert the detector's result into a {@link ColorCapability}.
 *
 * @param info - Detector result, `false` when the stream accepts nothing.
 *
 * @returns The equivalent capability.
 */
export function toColorCapability(info: ColorInfo): ColorCapability {
  if (!info) {
    return COLOR_CAPABILITY_NONE
  }
  const { has16m, has256, hasBasic, level } = info
  return {
    palette: toColorPalette(level),
    level,
    hasBasic,
    has256,
    has16m,
  }
}

/**
 * Convert a numeric detector level into its palette name.
 *
 * @param level - Level 0 none through 3 truecolor.
 *
 * @returns The matching palette name.
 */
export function toColorPalette(level: 0 | 1 | 2 | 3): ColorPalette {
  if (level >= 3) {
    return 'truecolor'
  }
  if (level === 2) {
    return 'ansi256'
  }
  if (level === 1) {
    return 'basic'
  }
  return 'none'
}
