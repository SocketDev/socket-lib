/**
 * @fileoverview Shimmer animation engine — pure functions, zero deps.
 *
 * Animates a "wave" of color sweeping across a string. Designed for
 * terminal spinners but the engine output is just `RGB[]`, so adapters
 * can render to ANSI, SVG keyframes, Ink components, or anything else.
 *
 * The engine is one function: `frameColors(spec, length, frame) → RGB[]`.
 * It is pure — same inputs produce the same output, no shared state.
 *
 * A {@link ShimmerSpec} bundles three orthogonal pieces:
 *
 *   1. `positionAt(frame)` — the wave's center at frame N (in char units;
 *      negative = off-screen left, > textLength = off-screen right).
 *      Built-ins: {@link ltrSweep}, {@link rtlSweep},
 *      {@link bidirectionalSweep}, {@link randomSweep}, {@link noSweep}.
 *
 *   2. `kernel(signedDistance, ctx)` — given a char's signed distance from
 *      the wave center, produce its color. Built-ins: {@link blockKernel}
 *      (hard on/off) and {@link smoothKernel} (soft glow).
 *
 *   3. `baseColor(i)` / `highlightColor(i)` — per-char palette anchors fed
 *      to the kernel as `ctx.baseColor` and `ctx.highlightColor`. Build
 *      these with {@link solidColor} (one color for every char) or
 *      {@link gradient} (cycle through a palette).
 *
 * Most callers don't build a spec by hand. {@link configToSpec} translates
 * the flat {@link ShimmerConfig} (`{ color, dir, speed, … }`) into a spec
 * using sensible defaults. The spinner uses this internally.
 *
 * Adapters in `shimmer-terminal.ts` and `shimmer-keyframes.ts` consume the
 * engine's `RGB[]` output and render it to ANSI escape sequences or SVG
 * SMIL keyframes respectively.
 *
 * @example Smooth socket-lib-style shimmer over a single color:
 * ```ts
 * import { configToSpec, frameColors } from '@socketsecurity/lib/effects/shimmer'
 * const spec = configToSpec({ color: [140, 82, 255], dir: 'ltr' }, 'Loading'.length)
 * const colorsAtFrame0 = frameColors(spec, 7, 0)
 * ```
 *
 * @example Discrete claude-code-style shimmer with a rainbow gradient:
 * ```ts
 * import { configToSpec } from '@socketsecurity/lib/effects/shimmer'
 * import { RAINBOW_GRADIENT } from '@socketsecurity/lib/themes/utils'
 * const spec = configToSpec(
 *   { color: RAINBOW_GRADIENT, dir: 'ltr', kernel: 'block' },
 *   'ultrathink'.length,
 * )
 * ```
 */

import {
  ArrayIsArray,
  ErrorCtor,
  MathAbs,
  MathFloor,
  MathRound,
} from '../primordials'

// === Types ===

/**
 * RGB color tuple. Each channel is 0-255.
 */
export type RGB = readonly [r: number, g: number, b: number]

/**
 * Ordered palette of RGB colors. Indexed via `i % length` in
 * {@link gradient} so palettes shorter than the text wrap.
 */
export type Palette = readonly RGB[]

/**
 * Direction the wave sweeps.
 *
 * - `'ltr'` — wave moves left-to-right, restarts at left.
 * - `'rtl'` — wave moves right-to-left, restarts at right.
 * - `'bi'`  — alternates LTR and RTL each cycle.
 * - `'random'` — re-rolls direction at each cycle boundary.
 * - `'none'` — wave never appears (every char shows base color).
 */
export type ShimmerDirection = 'ltr' | 'rtl' | 'bi' | 'random' | 'none'

/**
 * Context passed to a {@link Kernel} on each invocation. Holds the per-char
 * base and highlight colors so the kernel can blend between them.
 */
export type KernelContext = {
  /** Color this char shows when the wave is far away. */
  readonly baseColor: RGB
  /** Color this char shows when the wave is centered on it. */
  readonly highlightColor: RGB
}

/**
 * A {@link Kernel} maps a char's signed distance from the wave center to
 * a color. Negative distance = wave hasn't reached this char yet; positive
 * distance = wave has passed it.
 */
export type Kernel = (signedDistance: number, ctx: KernelContext) => RGB

/**
 * Functional shimmer specification — the full engine input. Built up from
 * orthogonal pieces (position generator, kernel, palette functions) so any
 * piece can be replaced independently.
 */
export type ShimmerSpec = {
  /** Wave-center position at frame N. */
  readonly positionAt: (frame: number) => number
  /** Maps wave distance + per-char palette context to a color. */
  readonly kernel: Kernel
  /** Per-char base color (when the wave is far away). */
  readonly baseColor: (charIndex: number) => RGB
  /** Per-char highlight color (when the wave is on the char). */
  readonly highlightColor: (charIndex: number) => RGB
}

/**
 * User-facing flat shimmer config. Translated to a {@link ShimmerSpec} by
 * {@link configToSpec}. Pass a `ShimmerSpec` directly when you need full
 * control over the wave's curve.
 */
export type ShimmerConfig = {
  /**
   * Base color (single RGB) or per-char palette (array of RGB).
   * @default [140, 82, 255] — Socket purple
   */
  readonly color?: RGB | Palette | undefined
  /**
   * Highlight color shown when the wave is on a char. Single RGB or
   * per-char palette, same shape as `color`.
   * @default [255, 255, 255] — pure white
   */
  readonly highlight?: RGB | Palette | undefined
  /**
   * Wave direction. See {@link ShimmerDirection}.
   * @default 'ltr'
   */
  readonly dir?: ShimmerDirection | undefined
  /**
   * Steps the wave advances per frame. Lower values = slower wave.
   * @default 1/3 (≈0.333) — three frames advance the wave by one char.
   */
  readonly speed?: number | undefined
  /**
   * Off-screen padding in char units on each side. The wave starts and
   * ends past the text by this much so it fades in/out cleanly.
   * @default 2
   */
  readonly padding?: number | undefined
  /**
   * Half-width of the wave in chars (used by `smoothKernel`). Higher =
   * wider bright zone. Ignored when `kernel: 'block'`.
   * @default 2.5
   */
  readonly width?: number | undefined
  /**
   * Wave shape. `'block'` is a hard 3-char-wide highlight (claude-code
   * behavior). `'smooth'` is a power-curve glow (the previous library's
   * default).
   * @default 'smooth'
   */
  readonly kernel?: 'block' | 'smooth' | undefined
}

// === Constants ===

/**
 * Default base color used by {@link configToSpec} when `color` is omitted.
 * Socket purple — matches the spinner's default color.
 */
export const DEFAULT_BASE_COLOR: RGB = [140, 82, 255]

/**
 * Default highlight color used by {@link configToSpec} when `highlight` is
 * omitted. Pure white.
 */
export const WHITE: RGB = [255, 255, 255]

// === Palette helpers ===

/**
 * Linearly interpolate between two RGB colors. `t` is clamped to [0, 1].
 *
 * @param a color at `t=0`
 * @param b color at `t=1`
 * @param t blend factor; values outside [0, 1] are clamped
 * @returns blended RGB with each channel rounded to integer
 */
export function blendRgb(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return [
    MathRound(a[0] + (b[0] - a[0]) * k),
    MathRound(a[1] + (b[1] - a[1]) * k),
    MathRound(a[2] + (b[2] - a[2]) * k),
  ]
}

/**
 * Build a per-char palette function that cycles through a fixed palette:
 * `(i) => palette[i % palette.length]`.
 *
 * @throws {Error} if `palette` is empty
 */
export function gradient(palette: Palette): (i: number) => RGB {
  if (palette.length === 0) {
    throw new ErrorCtor('gradient palette must not be empty')
  }
  return i => palette[i % palette.length]!
}

/**
 * Build a per-char palette function that returns the same color for every
 * char index. Useful when shimmering text with a single base color.
 */
export function solidColor(color: RGB): (i: number) => RGB {
  return () => color
}

// === Kernels ===

/**
 * Discrete on/off kernel — each char is either fully `highlightColor`
 * (within `halfWidth` of the wave center) or fully `baseColor`. No blend.
 *
 * Matches claude-code's spinner behavior at `halfWidth=1` (a 3-char bright
 * zone: the char at the wave center plus its left and right neighbors).
 *
 * @param halfWidth chars on each side of the wave center to highlight
 * @default halfWidth=1
 */
export function blockKernel(halfWidth: number = 1): Kernel {
  return (d, ctx) =>
    MathAbs(d) <= halfWidth ? ctx.highlightColor : ctx.baseColor
}

/**
 * Smooth blend kernel — char's color blends from `baseColor` toward
 * `highlightColor` as it approaches the wave center. Falloff curve is
 * `(1 - |d|/halfWidth)^falloff`, giving a soft glow with a wider radius
 * than `blockKernel`.
 *
 * Matches socket-lib's previous default at `halfWidth=2.5, falloff=2.5`.
 *
 * @param halfWidth chars on each side affected by the wave
 * @param falloff intensity exponent (higher = sharper peak)
 * @default halfWidth=2.5, falloff=2.5
 */
export function smoothKernel(
  halfWidth: number = 2.5,
  falloff: number = 2.5,
): Kernel {
  return (d, ctx) => {
    const dist = MathAbs(d)
    if (dist >= halfWidth) {
      return ctx.baseColor
    }
    const t = (1 - dist / halfWidth) ** falloff
    return blendRgb(ctx.baseColor, ctx.highlightColor, t)
  }
}

// === Position generators (sweep functions) ===

/**
 * Build a position function for bidirectional motion: the wave does one
 * left-to-right pass, then one right-to-left pass, then loops.
 *
 * @param textLength number of chars in the target string
 * @param padding off-screen chars on each side
 * @default padding=2
 */
export function bidirectionalSweep(
  textLength: number,
  padding: number = 2,
): (frame: number) => number {
  const cycle = textLength + 2 * padding
  const fullCycle = cycle * 2
  return frame => {
    const f = ((frame % fullCycle) + fullCycle) % fullCycle
    if (f < cycle) {
      return f - padding
    }
    return textLength + padding - 1 - (f - cycle)
  }
}

/**
 * Build a position function for left-to-right motion: the wave starts at
 * `-padding` (off-screen left), advances by 1 per frame, exits at
 * `textLength + padding`, then wraps.
 *
 * @param textLength number of chars in the target string
 * @param padding off-screen chars on each side
 * @default padding=2
 */
export function ltrSweep(
  textLength: number,
  padding: number = 2,
): (frame: number) => number {
  const cycle = textLength + 2 * padding
  return frame => (((frame % cycle) + cycle) % cycle) - padding
}

/**
 * Build a position function that hides the wave forever. Returns
 * `-Infinity` for every frame so the kernel always sees `signedDistance` >
 * `halfWidth` and produces base colors. Used by `configToSpec` when
 * `dir: 'none'`.
 */
export function noSweep(): (frame: number) => number {
  return () => -Infinity
}

/**
 * Build a position function that randomly picks LTR or RTL at each cycle
 * boundary. The PRNG is configurable (defaults to `Math.random`) so callers
 * can seed it for reproducible animations.
 *
 * @param textLength number of chars in the target string
 * @param padding off-screen chars on each side
 * @param random PRNG returning [0, 1); defaults to `Math.random`
 * @default padding=2, random=Math.random
 */
export function randomSweep(
  textLength: number,
  padding: number = 2,
  random: () => number = Math.random,
): (frame: number) => number {
  const cycle = textLength + 2 * padding
  let dir: 'ltr' | 'rtl' = random() < 0.5 ? 'ltr' : 'rtl'
  let lastCycleIndex = 0
  return frame => {
    const f =
      ((frame % (cycle * 2 ** 30)) + cycle * 2 ** 30) % (cycle * 2 ** 30)
    const cycleIndex = MathFloor(f / cycle)
    if (cycleIndex !== lastCycleIndex) {
      dir = random() < 0.5 ? 'ltr' : 'rtl'
      lastCycleIndex = cycleIndex
    }
    const inCycle = f % cycle
    return dir === 'ltr'
      ? inCycle - padding
      : textLength + padding - 1 - inCycle
  }
}

/**
 * Build a position function for right-to-left motion: the wave starts at
 * the right edge, decreases by 1 per frame, exits at `-padding` left of
 * char 0, then wraps.
 *
 * @param textLength number of chars in the target string
 * @param padding off-screen chars on each side
 * @default padding=2
 */
export function rtlSweep(
  textLength: number,
  padding: number = 2,
): (frame: number) => number {
  const cycle = textLength + 2 * padding
  return frame => textLength + padding - 1 - (((frame % cycle) + cycle) % cycle)
}

// === Spec construction ===

/**
 * Translate a {@link ShimmerDirection} string to its position-generator
 * function. Used by {@link configToSpec}; exported for callers that want
 * to swap kernel or palette while keeping the standard sweep mapping.
 */
export function directionToSweep(
  dir: ShimmerDirection,
  textLength: number,
  padding: number,
): (frame: number) => number {
  switch (dir) {
    case 'rtl':
      return rtlSweep(textLength, padding)
    case 'bi':
      return bidirectionalSweep(textLength, padding)
    case 'random':
      return randomSweep(textLength, padding)
    case 'none':
      return noSweep()
    default:
      return ltrSweep(textLength, padding)
  }
}

/**
 * Translate a flat {@link ShimmerConfig} into a {@link ShimmerSpec}.
 * Applies defaults for omitted fields; resolves `color` and `highlight`
 * (which may be a single RGB or a palette) into per-char palette
 * functions.
 *
 * The spinner uses this internally; callers who only need the standard
 * shape can call this directly. Advanced callers can construct a
 * `ShimmerSpec` by hand to plug in custom kernels or position generators.
 */
export function configToSpec(
  config: ShimmerConfig,
  textLength: number,
): ShimmerSpec {
  const dir = config.dir ?? 'ltr'
  const padding = config.padding ?? 2
  const speed = config.speed ?? 1 / 3
  const baseColor = resolvePalette(config.color, DEFAULT_BASE_COLOR)
  const highlightColor = resolvePalette(config.highlight, WHITE)
  const kernel =
    config.kernel === 'block'
      ? blockKernel(1)
      : smoothKernel(config.width ?? 2.5)
  // Caller passes integer frame counts; spec applies `speed` to convert to
  // shimmer steps. Speed=1/3 means 3 frames advance the wave by 1 char.
  const sweep = directionToSweep(dir, textLength, padding)
  return {
    positionAt: frame => sweep(frame * speed),
    kernel,
    baseColor,
    highlightColor,
  }
}

/**
 * Resolve a {@link ShimmerConfig.color}-shaped input into a per-char
 * palette function. Accepts a single RGB tuple, an ordered palette, or
 * `undefined` (in which case `defaultColor` is used).
 *
 * Used internally by {@link configToSpec}; exported so callers can build
 * partial specs that share the same input-shape rules.
 */
export function resolvePalette(
  source: RGB | Palette | undefined,
  defaultColor: RGB,
): (i: number) => RGB {
  if (source === undefined) {
    return solidColor(defaultColor)
  }
  if (ArrayIsArray(source[0])) {
    return gradient(source as Palette)
  }
  return solidColor(source as RGB)
}

// === Engine ===

/**
 * Compute per-character colors for a single frame. This is the engine.
 *
 * @param spec functional shimmer specification
 * @param textLength number of chars to color
 * @param frame caller-controlled frame counter (any number; the position
 *   generator handles wrapping)
 * @returns one RGB tuple per char index, in order
 *
 * @example
 * ```ts
 * const colors = frameColors(spec, 'Loading'.length, frameCounter)
 * // colors[0] = the color of 'L' at this frame
 * // colors[6] = the color of 'g' at this frame
 * ```
 */
export function frameColors(
  spec: ShimmerSpec,
  textLength: number,
  frame: number,
): RGB[] {
  const wavePos = spec.positionAt(frame)
  const out: RGB[] = []
  for (let i = 0; i < textLength; i++) {
    const ctx: KernelContext = {
      __proto__: null,
      baseColor: spec.baseColor(i),
      highlightColor: spec.highlightColor(i),
    } as unknown as KernelContext
    out.push(spec.kernel(i - wavePos, ctx))
  }
  return out
}
