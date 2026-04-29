/**
 * @fileoverview Shimmer animation engine. Pure functions, zero deps.
 *
 * The engine produces a per-character RGB array for a given frame number.
 * Three concerns are decoupled:
 *   - positionAt(frame): where the wave's center is (in char units; negative
 *     = off-screen left, > textLength = off-screen right).
 *   - kernel(signedDistance, ctx): how a char near the wave is colored.
 *   - baseColor(i) / highlightColor(i): per-char palette anchors fed to the
 *     kernel.
 *
 * Adapters in shimmer-terminal.ts and shimmer-keyframes.ts turn the RGB
 * array into ANSI sequences or SMIL keyframes respectively.
 */

/**
 * 3-tuple RGB color. 0-255 per channel.
 */
export type RGB = readonly [r: number, g: number, b: number]

/**
 * Palette of RGB colors. Indexed wraps with `i % length` in {@link gradient}.
 */
export type Palette = readonly RGB[]

/**
 * Direction or random/none variants for the built-in sweep generators.
 */
export type ShimmerDirection = 'ltr' | 'rtl' | 'bi' | 'random' | 'none'

/**
 * Kernel context passed to a kernel function on each invocation.
 */
export type KernelContext = {
  readonly baseColor: RGB
  readonly highlightColor: RGB
}

/**
 * A kernel maps `(signedDistance, ctx) → color`. Signed distance is the
 * character's position minus the wave's current position. Negative = the
 * wave hasn't reached this char yet; positive = the wave has passed it.
 */
export type Kernel = (signedDistance: number, ctx: KernelContext) => RGB

/**
 * Functional shimmer specification — the full input to the engine.
 */
export type ShimmerSpec = {
  /** Wave center position at frame N. */
  readonly positionAt: (frame: number) => number
  /** How the wave colors a char given its signed distance from the wave. */
  readonly kernel: Kernel
  /** Per-char base color. */
  readonly baseColor: (charIndex: number) => RGB
  /** Per-char highlight color (shown when the wave is on the char). */
  readonly highlightColor: (charIndex: number) => RGB
}

/**
 * User-facing shimmer config. Flat ergonomic shape; the spinner translates
 * this to a {@link ShimmerSpec} internally. Pass a `ShimmerSpec` directly if
 * you need full control over the animation curve.
 */
export type ShimmerConfig = {
  /** Base color or per-char palette. Single RGB = same color for every char. */
  readonly color?: RGB | Palette | undefined
  /** Highlight color (shown when wave is on a char). Defaults to white. */
  readonly highlight?: RGB | Palette | undefined
  /** Wave direction. */
  readonly dir?: ShimmerDirection | undefined
  /**
   * Steps per frame. Lower = slower wave.
   * @default 1/3 (matches the previous library default).
   */
  readonly speed?: number | undefined
  /**
   * Off-screen padding in chars on each side. Wave starts/ends past the
   * text bounds by this much so it fades in/out cleanly.
   * @default 2
   */
  readonly padding?: number | undefined
  /**
   * Half-width of the wave in chars. Higher = wider bright zone.
   * Used by the default kernel; ignored if you provide a custom kernel.
   * @default 2.5
   */
  readonly width?: number | undefined
  /**
   * Wave kernel: 'block' = hard 3-char highlight, 'smooth' = power-curve
   * blend toward highlight color.
   * @default 'smooth'
   */
  readonly kernel?: 'block' | 'smooth' | undefined
}

const WHITE: RGB = [255, 255, 255]

/**
 * Linear interpolation between two RGB colors. `t` clamped to [0, 1].
 */
export function blendRGB(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

/**
 * Single-color palette function: every char gets the same color.
 */
export function constant(color: RGB): (i: number) => RGB {
  return () => color
}

/**
 * Per-char palette function. `palette[i % palette.length]`. Empty palette
 * throws on first call.
 */
export function gradient(palette: Palette): (i: number) => RGB {
  if (palette.length === 0) {
    throw new Error('gradient palette must not be empty')
  }
  return i => palette[i % palette.length]!
}

/**
 * Discrete on/off kernel — char is highlight color if within `halfWidth` of
 * the wave center, base color otherwise. Matches claude-code's behavior.
 *
 * @default halfWidth=1 (3-char-wide highlight zone)
 */
export function blockKernel(halfWidth: number = 1): Kernel {
  return (d, ctx) =>
    Math.abs(d) <= halfWidth ? ctx.highlightColor : ctx.baseColor
}

/**
 * Smooth blend kernel — char's color blends toward highlight as it
 * approaches the wave center. Falloff is `(1 - |d|/halfWidth)^falloff`
 * which gives a soft glow. Matches socket-lib's previous behavior.
 *
 * @default halfWidth=2.5, falloff=2.5
 */
export function smoothKernel(
  halfWidth: number = 2.5,
  falloff: number = 2.5,
): Kernel {
  return (d, ctx) => {
    const dist = Math.abs(d)
    if (dist >= halfWidth) {
      return ctx.baseColor
    }
    const t = (1 - dist / halfWidth) ** falloff
    return blendRGB(ctx.baseColor, ctx.highlightColor, t)
  }
}

/**
 * Position generator — wave sweeps left-to-right.
 * Wave starts at -padding (just before char 0) and ends at textLength + padding.
 */
export function ltrSweep(
  textLength: number,
  padding: number = 2,
): (frame: number) => number {
  const cycle = textLength + 2 * padding
  return frame => (((frame % cycle) + cycle) % cycle) - padding
}

/**
 * Position generator — wave sweeps right-to-left.
 */
export function rtlSweep(
  textLength: number,
  padding: number = 2,
): (frame: number) => number {
  const cycle = textLength + 2 * padding
  return frame => textLength + padding - 1 - (((frame % cycle) + cycle) % cycle)
}

/**
 * Position generator — wave alternates LTR then RTL each cycle.
 */
export function biSweep(
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
 * Position generator — wave never appears (returns -Infinity so kernel sees
 * every char as base color). Used as the 'none' direction.
 */
export function noSweep(): (frame: number) => number {
  return () => -Infinity
}

/**
 * Position generator — random direction per cycle. Uses the supplied PRNG
 * (or `Math.random` by default) at each cycle boundary to pick LTR or RTL.
 *
 * @param random optional PRNG returning [0, 1); defaults to Math.random.
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
    const cycleIndex = Math.floor(f / cycle)
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
 * Translate a flat {@link ShimmerConfig} into a {@link ShimmerSpec}. The
 * spinner uses this internally; callers that need raw control can build a
 * spec by hand.
 */
export function configToSpec(
  config: ShimmerConfig,
  textLength: number,
): ShimmerSpec {
  const dir = config.dir ?? 'ltr'
  const padding = config.padding ?? 2
  const speed = config.speed ?? 1 / 3
  const baseColor = paletteFn(config.color, [140, 82, 255])
  const highlightColor = paletteFn(config.highlight, WHITE)
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

function paletteFn(
  source: RGB | Palette | undefined,
  defaultColor: RGB,
): (i: number) => RGB {
  if (source === undefined) {
    return constant(defaultColor)
  }
  if (Array.isArray(source[0])) {
    return gradient(source as Palette)
  }
  return constant(source as RGB)
}

function directionToSweep(
  dir: ShimmerDirection,
  textLength: number,
  padding: number,
): (frame: number) => number {
  switch (dir) {
    case 'rtl':
      return rtlSweep(textLength, padding)
    case 'bi':
      return biSweep(textLength, padding)
    case 'random':
      return randomSweep(textLength, padding)
    case 'none':
      return noSweep()
    default:
      return ltrSweep(textLength, padding)
  }
}

/**
 * Compute per-character colors for a single frame.
 *
 * @param spec functional shimmer specification.
 * @param textLength number of characters to color.
 * @param frame frame number (caller-controlled time).
 * @returns one RGB tuple per character.
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
